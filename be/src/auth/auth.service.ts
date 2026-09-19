import {
  BadGatewayException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { extractBearerToken } from './auth-header.util';
import { AuthTokenCache } from './auth-token.cache';
import { RedisService } from '../redis/redis.service';

type OAuthTokens = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly baseUrl: string;
  private readonly issuer: string;
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly successRedirect?: string;
  private readonly tokenCache: AuthTokenCache<unknown>;

  constructor(
    private readonly httpService: HttpService,
    redis: RedisService,
  ) {
    this.baseUrl = this.requiredUrl('PROFILES_API_BASE_URL');
    this.issuer = this.requiredUrl('BCN_OAUTH_ISSUER');
    this.clientId = this.required('BCN_OAUTH_CLIENT_ID');
    this.redirectUri = this.requiredUrl('BCN_OAUTH_REDIRECT_URI');
    this.successRedirect = this.optionalUrl('BCN_OAUTH_SUCCESS_REDIRECT_URL');
    this.tokenCache = new AuthTokenCache<unknown>(
      redis,
      Number(process.env.AUTH_CACHE_TTL_MS || 0),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.warmupProfilesConnection();
  }

  startLogin(): { authorizationUrl: string; setCookies: string[] } {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = new URL(`${this.issuer}/oauth/authorize`);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

    return {
      authorizationUrl: url.toString(),
      setCookies: [
        this.cookie('quiz_oauth_state', state, 300, this.oauthCallbackPath()),
        this.cookie(
          'quiz_oauth_verifier',
          verifier,
          300,
          this.oauthCallbackPath(),
        ),
      ],
    };
  }

  async finishLogin(
    code: string | undefined,
    state: string | undefined,
    cookieHeader?: string,
  ): Promise<{
    profile: unknown;
    redirectUrl?: string;
    setCookies: string[];
  }> {
    const cookies = this.parseCookies(cookieHeader);
    const expectedState = cookies.quiz_oauth_state;
    const verifier = cookies.quiz_oauth_verifier;
    if (
      !code ||
      !state ||
      !expectedState ||
      !verifier ||
      !this.equal(state, expectedState)
    ) {
      throw new UnauthorizedException({
        code: 'OAUTH_STATE_INVALID',
        message: 'OAuth callback state is invalid or expired',
      });
    }

    const tokens = await this.requestTokens(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        code,
        redirect_uri: this.redirectUri,
        code_verifier: verifier,
      }),
    );
    const profile = await this.fetchProfile(tokens.access_token);

    return {
      profile,
      redirectUrl: this.successRedirect,
      setCookies: [
        ...this.clearTransientCookies(),
        ...this.tokenCookies(tokens),
      ],
    };
  }

  async refresh(cookieHeader?: string): Promise<{
    refreshed: true;
    expiresIn: number;
    setCookies: string[];
  }> {
    const refreshToken = this.parseCookies(cookieHeader).quiz_refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is missing',
      });
    }
    const tokens = await this.requestTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        refresh_token: refreshToken,
      }),
    );
    return {
      refreshed: true,
      expiresIn: tokens.expires_in,
      setCookies: this.tokenCookies(tokens),
    };
  }

  async logout(
    cookieHeader?: string,
    authorization?: string,
  ): Promise<{ loggedOut: true; setCookies: string[] }> {
    const cookies = this.parseCookies(cookieHeader);
    const accessToken =
      extractBearerToken(authorization) ?? cookies.quiz_access_token;
    const token = cookies.quiz_refresh_token ?? accessToken;
    if (accessToken) await this.tokenCache.delete(this.cacheKey(accessToken));

    if (token) {
      try {
        await firstValueFrom(
          this.httpService.post(
            `${this.baseUrl}/oauth/revoke`,
            { token },
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      } catch (error) {
        this.logger.warn(
          `[logout] Profiles revoke failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    return { loggedOut: true, setCookies: this.clearAllCookies() };
  }

  async validateToken(
    token?: string,
    cookieHeader?: string,
    authorization?: string,
  ): Promise<unknown> {
    const accessToken =
      extractBearerToken(authorization) ??
      token ??
      this.parseCookies(cookieHeader).quiz_access_token;
    if (!accessToken) {
      throw new UnauthorizedException('Missing authentication token');
    }
    const cacheKey = this.cacheKey(accessToken);
    try {
      return await this.tokenCache.getOrLoad(cacheKey, () =>
        this.fetchProfile(accessToken),
      );
    } catch (error) {
      await this.tokenCache.delete(cacheKey);
      this.throwUpstreamAuthError(
        error,
        'validateToken',
        'Invalid token or unauthorized',
      );
    }
  }

  clearTransientCookies(): string[] {
    return [
      this.clearCookie('quiz_oauth_state', this.oauthCallbackPath()),
      this.clearCookie('quiz_oauth_verifier', this.oauthCallbackPath()),
    ];
  }

  private async requestTokens(body: URLSearchParams): Promise<OAuthTokens> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<OAuthTokens>(
          `${this.baseUrl}/oauth/token`,
          body.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.throwUpstreamAuthError(error, 'oauthToken', 'OAuth grant failed');
    }
  }

  private async fetchProfile(
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: Number(process.env.PROFILES_HTTP_TIMEOUT_MS ?? 5000),
        }),
      );
      const profile = this.unwrapProfile(response.data);
      const fromMeRoles = this.normalizeRoles(profile.roles);
      const fromMePerms = this.normalizePermissions(profile.permissions);
      // Prefer roles/permissions from OAuth userinfo. /me/applications needs
      // Profiles cookie JWT and fails with 401 for app access tokens.
      const quizRoles =
        fromMeRoles.length > 0
          ? fromMeRoles
          : await this.fetchQuizAppRoles(accessToken);
      return {
        ...profile,
        roles: quizRoles,
        permissions: fromMePerms,
      };
    } catch (error) {
      this.throwUpstreamAuthError(error, 'profile', 'Cannot load BCN profile');
    }
  }

  /** App roles from Profiles RBAC (MEMBER / MENTOR / ADMIN), not platform USER/ADMIN. */
  private async fetchQuizAppRoles(accessToken: string): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/me/applications`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: Number(process.env.PROFILES_HTTP_TIMEOUT_MS ?? 5000),
        }),
      );
      const rows = this.unwrapList(response.data);
      const quiz = rows.find(
        (row) =>
          typeof row.code === 'string' && row.code.toUpperCase() === 'QUIZ',
      );
      return this.normalizeRoles(quiz?.roles);
    } catch (error) {
      this.logger.warn(
        `[profile] me/applications failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return [];
    }
  }

  /** Flatten Profiles envelope `{ data: user }` or raw user into one object. */
  private unwrapProfile(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {};
    let current = payload as Record<string, unknown>;
    for (let depth = 0; depth < 3; depth += 1) {
      const nested = current.data;
      if (
        nested &&
        typeof nested === 'object' &&
        !Array.isArray(nested) &&
        ('id' in nested || 'email' in nested)
      ) {
        current = nested as Record<string, unknown>;
        continue;
      }
      break;
    }
    return { ...current };
  }

  private normalizeRoles(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .filter(
            (role): role is string => typeof role === 'string' && !!role.trim(),
          )
          .map((role) => role.toLowerCase()),
      ),
    ];
  }

  private normalizePermissions(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .filter(
            (permission): permission is string =>
              typeof permission === 'string' && !!permission.trim(),
          )
          .map((permission) => permission.toLowerCase()),
      ),
    ];
  }

  private unwrapList(
    payload: unknown,
  ): Array<{ code?: string; roles?: unknown }> {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      const data = (payload as { data?: unknown }).data;
      if (Array.isArray(data)) return data;
    }
    return [];
  }

  private tokenCookies(tokens: OAuthTokens): string[] {
    const refreshTtl = Number(
      process.env.BCN_OAUTH_REFRESH_TOKEN_TTL_SECONDS ?? 30 * 24 * 60 * 60,
    );
    return [
      this.cookie('quiz_access_token', tokens.access_token, tokens.expires_in),
      this.cookie(
        'quiz_refresh_token',
        tokens.refresh_token,
        refreshTtl,
        this.oauthAuthPath(),
      ),
    ];
  }

  private clearAllCookies(): string[] {
    return [
      ...this.clearTransientCookies(),
      this.clearCookie('quiz_access_token'),
      this.clearCookie('quiz_refresh_token', this.oauthAuthPath()),
    ];
  }

  private oauthCallbackPath(): string {
    try {
      return new URL(this.redirectUri).pathname || '/api/auth/callback';
    } catch {
      return '/api/auth/callback';
    }
  }

  private oauthAuthPath(): string {
    return (
      this.oauthCallbackPath().replace(/\/callback\/?$/, '') || '/api/auth'
    );
  }

  private cookie(
    name: string,
    value: string,
    maxAgeSeconds: number,
    path = '/',
  ): string {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${name}=${encodeURIComponent(value)}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Path=${path}; HttpOnly; SameSite=Lax${secure}`;
  }

  private clearCookie(name: string, path = '/'): string {
    return this.cookie(name, '', 0, path);
  }

  private parseCookies(header?: string): Record<string, string> {
    if (!header) return {};
    return Object.fromEntries(
      header.split(';').flatMap((part) => {
        const index = part.indexOf('=');
        if (index < 1) return [];
        const key = part.slice(0, index).trim();
        try {
          return [[key, decodeURIComponent(part.slice(index + 1).trim())]];
        } catch {
          return [];
        }
      }),
    );
  }

  private equal(actual: string, expected: string): boolean {
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private cacheKey(token: string): string {
    return AuthTokenCache.hashCredentials([token]);
  }

  private async warmupProfilesConnection(): Promise<void> {
    const startedAt = Date.now();
    try {
      await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/me`, {
          timeout: Number(process.env.PROFILES_WARMUP_TIMEOUT_MS ?? 3000),
          validateStatus: () => true,
        }),
      );
      this.logger.log(
        `[warmup] Profiles ready issuer=${this.issuer} durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      this.logger.warn(
        `[warmup] Profiles connection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} environment variable is required`);
    return value;
  }

  private requiredUrl(name: string): string {
    const value = this.required(name).replace(/\/$/, '');
    this.assertHttpUrl(name, value);
    return value;
  }

  private optionalUrl(name: string): string | undefined {
    const value = process.env[name]?.trim();
    if (!value) return undefined;
    this.assertHttpUrl(name, value);
    return value;
  }

  private assertHttpUrl(name: string, value: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} must be an absolute URL`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`${name} must use http or https`);
    }
  }

  private throwUpstreamAuthError(
    error: unknown,
    context: string,
    fallbackMessage: string,
  ): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      this.logger.warn(`[${context}] Profiles status=${status ?? 'network'}`);
      if (!error.response) {
        throw new ServiceUnavailableException(
          'Profiles auth service unavailable',
        );
      }
      if (status !== undefined && status >= 500) {
        throw new BadGatewayException('Profiles auth service error');
      }
    } else {
      this.logger.error(`[${context}] unexpected error`, error as Error);
    }
    throw new UnauthorizedException(fallbackMessage);
  }
}
