import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TowerBotGuard } from './tower-bot.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
  const req = {
    headers,
    ip: '127.0.0.1',
    url: '/tower/floor/answer',
    user: { id: 'u1' },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('TowerBotGuard', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('blocks automated User-Agents like curl, python-requests and HeadlessChrome', async () => {
    const guard = new TowerBotGuard();
    for (const ua of [
      'curl/8.4.0',
      'python-requests/2.31.0',
      'Mozilla/5.0 HeadlessChrome/120.0',
      'Playwright/1.40',
      '',
    ]) {
      await expect(
        guard.canActivate(makeContext({ 'user-agent': ua })),
      ).rejects.toThrow(ForbiddenException);
    }
  });

  it('allows legitimate mobile devices (including Cubot) and normal browsers', async () => {
    const guard = new TowerBotGuard();
    const browserUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
    const cubotUa =
      'Mozilla/5.0 (Linux; Android 13; CUBOT P80) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';

    process.env.NODE_ENV = 'test';
    await expect(
      guard.canActivate(makeContext({ 'user-agent': browserUa })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(makeContext({ 'user-agent': cubotUa })),
    ).resolves.toBe(true);

    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://quizzes.bcn.id.vn';

    await expect(
      guard.canActivate(makeContext({ 'user-agent': browserUa })),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      guard.canActivate(
        makeContext({
          'user-agent': browserUa,
          origin: 'https://quizzes.bcn.id.vn',
        }),
      ),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(
        makeContext({
          'user-agent': cubotUa,
          origin: 'https://quizzes-uside-studio.vercel.app',
        }),
      ),
    ).resolves.toBe(true);
  });
});
