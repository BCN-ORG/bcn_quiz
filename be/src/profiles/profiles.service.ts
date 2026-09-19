import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import type { Request as ExpressRequest } from 'express';
import { firstValueFrom } from 'rxjs';

export type ProfilesUserSummary = {
  id: string;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
};

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = this.required('PROFILES_API_BASE_URL').replace(/\/$/, '');
    this.clientId = this.required('BCN_OAUTH_CLIENT_ID');
    this.clientSecret = process.env.PROFILES_CLIENT_SECRET?.trim() ?? '';
    if (process.env.NODE_ENV === 'production' && !this.clientSecret) {
      throw new Error(
        'PROFILES_CLIENT_SECRET environment variable is required',
      );
    }
  }

  async createTimelineEvent(
    req: ExpressRequest | undefined,
    data: {
      eventType: string;
      title: string;
      idempotencyKey: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.clientSecret) return;
    const userId = this.userId(req);
    if (!userId) return;

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/internal/timeline-events`,
          {
            userId,
            ...data,
          },
          {
            headers: {
              Authorization: this.basicAuthHeader(),
              'Content-Type': 'application/json',
            },
            timeout: Number(process.env.PROFILES_HTTP_TIMEOUT_MS ?? 5000),
          },
        ),
      );
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.warn(
          `[createTimelineEvent] Profiles status=${error.response?.status ?? 'network'}`,
        );
        return;
      }
      this.logger.error(
        '[createTimelineEvent] unexpected error',
        error as Error,
      );
    }
  }

  /** Resolve display names for review lists. Empty map if Profiles unreachable. */
  async resolveUsers(ids: string[]): Promise<Map<string, ProfilesUserSummary>> {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
    const out = new Map<string, ProfilesUserSummary>();
    if (!unique.length || !this.clientSecret) return out;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/internal/users`, {
          params: { ids: unique.join(',') },
          headers: { Authorization: this.basicAuthHeader() },
          timeout: Number(process.env.PROFILES_HTTP_TIMEOUT_MS ?? 5000),
        }),
      );
      const payload = response.data as
        | {
            data?: { users?: ProfilesUserSummary[] };
            users?: ProfilesUserSummary[];
          }
        | ProfilesUserSummary[];
      const users = Array.isArray(payload)
        ? payload
        : (payload.data?.users ?? payload.users ?? []);
      for (const user of users) {
        if (user?.id) out.set(user.id, user);
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.warn(
          `[resolveUsers] Profiles status=${error.response?.status ?? 'network'}`,
        );
        return out;
      }
      this.logger.error('[resolveUsers] unexpected error', error as Error);
    }
    return out;
  }

  private basicAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
  }

  private userId(req?: ExpressRequest): string | undefined {
    const user = (
      req as
        | (ExpressRequest & {
            user?: {
              id?: unknown;
              sub?: unknown;
              data?: { id?: unknown; user?: { id?: unknown } };
            };
          })
        | undefined
    )?.user;
    return [user?.id, user?.sub, user?.data?.id, user?.data?.user?.id].find(
      (value): value is string => typeof value === 'string' && !!value,
    );
  }

  private required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} environment variable is required`);
    return value;
  }
}
