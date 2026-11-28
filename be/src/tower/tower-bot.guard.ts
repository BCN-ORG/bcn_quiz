import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const BOT_UA_PATTERNS: readonly RegExp[] = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /httpx/i,
  /scrapy/i,
  /headlesschrome/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /webdriver/i,
  /phantomjs/i,
  /node-fetch/i,
  /undici/i,
  /axios\//i,
  /go-http-client/i,
  /postmanruntime/i,
  /insomnia\//i,
  /httpclient/i,
  /libwww-perl/i,
  /(?:^|[^a-z])(?:google|bing|gpt|discord|telegram|slack|yandex|baidu|ahrefs|semrush)?bot\b/i,
  /(?:^|[^a-z])spider\b/i,
  /(?:^|[^a-z])crawler\b/i,
];

@Injectable()
export class TowerBotGuard implements CanActivate {
  private readonly logger = new Logger(TowerBotGuard.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isDisabled()) return true;

    const req = context.switchToHttp().getRequest<ExpressRequest>();
    const ua = String(req.headers['user-agent'] ?? '').trim();
    const ip = this.extractIp(req);
    const userId = this.extractUserId(req);

    // 1. Block missing or automated/headless User-Agent
    const isBotUa =
      ua.length < 10 || BOT_UA_PATTERNS.some((pattern) => pattern.test(ua));
    if (isBotUa) {
      await this.logBlocked(userId, ip, ua, 'BOT_UA_BLOCKED', {
        path: req.originalUrl || req.url,
      });
      throw new ForbiddenException(
        'Kết nối tự động hoặc trình duyệt không hợp lệ không được phép tham gia Leo Tháp.',
      );
    }

    // 2. In production, enforce browser Origin / Sec-Fetch-Site for mutating requests
    if (process.env.NODE_ENV === 'production') {
      const origin = String(req.headers.origin ?? '').trim();
      const secFetchSite = String(req.headers['sec-fetch-site'] ?? '')
        .trim()
        .toLowerCase();

      const allowedOrigins = this.allowedOrigins();
      const originValid =
        origin.length > 0 &&
        allowedOrigins.some((allowed) =>
          typeof allowed === 'string'
            ? allowed.toLowerCase() === origin.toLowerCase()
            : allowed.test(origin),
        );
      const fetchSiteValid =
        secFetchSite === 'same-origin' || secFetchSite === 'same-site';

      if (!originValid && !fetchSiteValid) {
        await this.logBlocked(userId, ip, ua, 'INVALID_ORIGIN_BLOCKED', {
          origin: origin || null,
          secFetchSite: secFetchSite || null,
          path: req.originalUrl || req.url,
        });
        throw new ForbiddenException(
          'Yêu cầu không xuất phát từ giao diện trình duyệt hợp lệ.',
        );
      }
    }

    return true;
  }

  private isDisabled(): boolean {
    const raw = (process.env.TOWER_BOT_GUARD_ENABLED ?? '')
      .trim()
      .toLowerCase();
    return raw === 'false' || raw === '0' || raw === 'off';
  }

  private allowedOrigins(): Array<string | RegExp> {
    const envRaw = [
      process.env.CORS_ORIGINS,
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL,
    ]
      .filter(Boolean)
      .join(',');
    const envList = envRaw
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);

    return [
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
      /^https?:\/\/(.*\.)?uside\.id\.vn$/,
      /^https?:\/\/(.*\.)?uside\.studio$/,
      /^https:\/\/([a-z0-9-]+\.)*bcn\.id\.vn$/,
      /^https:\/\/.+\.vercel\.app$/,
      'https://quizzes.bcn.id.vn',
      'https://quizzes-uside-studio.vercel.app',
      ...envList,
    ];
  }

  private extractIp(req: ExpressRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim().slice(0, 64);
    }
    return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
  }

  private extractUserId(req: ExpressRequest): string {
    const user = (
      req as ExpressRequest & {
        user?: {
          id?: unknown;
          sub?: unknown;
          user?: { id?: unknown };
          data?: { id?: unknown; user?: { id?: unknown } };
        };
      }
    ).user;
    const candidates = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ];
    const found = candidates.find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    return found ?? 'anonymous';
  }

  private async logBlocked(
    userId: string,
    ip: string,
    ua: string,
    ruleCode: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    this.logger.warn(
      `[TowerBotGuard] Blocked ${ruleCode} userId=${userId} ip=${ip} ua=${ua.slice(0, 80)}`,
    );
    if (!this.prisma) return;
    await this.prisma.towerAntiCheatEvent
      .create({
        data: {
          userId,
          ruleCode,
          severity: 'HIGH',
          ip: ip || null,
          userAgent: ua.slice(0, 300) || null,
          details: details as never,
        },
      })
      .catch(() => undefined);
  }
}
