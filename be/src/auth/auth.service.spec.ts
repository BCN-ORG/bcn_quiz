import { UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createHash } from 'node:crypto';
import { of } from 'rxjs';
import { AuthService } from './auth.service';
import type { RedisService } from '../redis/redis.service';

function redisMock() {
  const store = new Map<string, unknown>();
  return {
    getJson: jest.fn(async (key: string) => store.get(key)),
    setJson: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => Number(store.delete(key))),
    delByPrefix: jest.fn(async () => 0),
  } as unknown as RedisService;
}

function cookieValue(cookie: string): string {
  return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
}

describe('AuthService BCN SSO', () => {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
  } as unknown as HttpService;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.PROFILES_API_BASE_URL = 'http://profiles:3000/api';
    process.env.BCN_OAUTH_ISSUER = 'https://profiles.example.com/api';
    process.env.BCN_OAUTH_CLIENT_ID = 'bcn-quiz';
    process.env.BCN_OAUTH_REDIRECT_URI =
      'https://quiz.example.com/api/auth/callback';
    delete process.env.BCN_OAUTH_SUCCESS_REDIRECT_URL;
    service = new AuthService(http, redisMock());
  });

  it('creates a valid PKCE S256 authorization request', () => {
    const flow = service.startLogin();
    const url = new URL(flow.authorizationUrl);
    const verifier = cookieValue(flow.setCookies[1]);

    expect(url.origin + url.pathname).toBe(
      'https://profiles.example.com/api/oauth/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('bcn-quiz');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(flow.setCookies.every((cookie) => cookie.includes('HttpOnly'))).toBe(
      true,
    );
    expect(flow.setCookies[0]).toContain('Path=/api/auth/callback');
    expect(flow.setCookies[1]).toContain('Path=/api/auth/callback');
  });

  it('exchanges the callback code and stores app tokens in HttpOnly cookies', async () => {
    const flow = service.startLogin();
    const state = cookieValue(flow.setCookies[0]);
    const verifier = cookieValue(flow.setCookies[1]);
    (http.post as jest.Mock).mockReturnValue(
      of({
        data: {
          access_token: 'access',
          token_type: 'Bearer',
          expires_in: 900,
          refresh_token: 'refresh',
        },
      }),
    );
    (http.get as jest.Mock).mockImplementation((url: string) => {
      if (String(url).includes('/me/applications')) {
        return of({
          data: {
            data: [{ code: 'QUIZ', roles: ['MEMBER', 'MENTOR'] }],
          },
        });
      }
      return of({
        data: { data: { id: 'user-1', email: 'user@example.com' } },
      });
    });

    const result = await service.finishLogin(
      'authorization-code',
      state,
      `quiz_oauth_state=${state}; quiz_oauth_verifier=${verifier}`,
    );

    expect(result.profile).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      roles: ['member', 'mentor'],
      permissions: [],
    });
    expect(result.setCookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('quiz_access_token=access'),
        expect.stringContaining('quiz_refresh_token=refresh'),
      ]),
    );
    expect(http.post).toHaveBeenCalledWith(
      'http://profiles:3000/api/oauth/token',
      expect.stringContaining(`code_verifier=${verifier}`),
      expect.any(Object),
    );
  });

  it('rejects a callback with the wrong state before calling Profiles', async () => {
    await expect(
      service.finishLogin(
        'code',
        'wrong-state',
        'quiz_oauth_state=expected; quiz_oauth_verifier=verifier',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(http.post).not.toHaveBeenCalled();
  });
});
