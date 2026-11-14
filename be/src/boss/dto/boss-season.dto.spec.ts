import { ValidationPipe } from '@nestjs/common';
import { UpsertBossSeasonDto } from './boss.dto';

describe('UpsertBossSeasonDto under the real ValidationPipe options', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: UpsertBossSeasonDto };
  const ok = {
    name: 'Tuần',
    bossName: 'Boss',
    bossMaxHp: 2000,
    milestones: [{ at: 500, coin: 5, name: 'Đồng' }],
  };
  it('accepts a valid body and instantiates nested milestones', async () => {
    const out = (await pipe.transform(ok, meta)) as UpsertBossSeasonDto;
    expect(out.milestones[0].at).toBe(500);
  });
  it('accepts an https image url or null, rejects other schemes', async () => {
    const good = (await pipe.transform(
      { ...ok, bossImageUrl: 'https://cdn.example.com/boss.png' },
      meta,
    )) as UpsertBossSeasonDto;
    expect(good.bossImageUrl).toBe('https://cdn.example.com/boss.png');
    await expect(
      pipe.transform({ ...ok, bossImageUrl: null }, meta),
    ).resolves.toBeDefined();
    for (const bad of [
      'javascript:alert(1)',
      'data:image/png;base64,AAA',
      'boss.png',
      'ftp://x/y.png',
    ]) {
      await expect(
        pipe.transform({ ...ok, bossImageUrl: bad }, meta),
      ).rejects.toBeDefined();
    }
  });

  it.each([
    ['bad hp', { ...ok, bossMaxHp: 5 }],
    ['no milestones', { ...ok, milestones: [] }],
    [
      'nested bad coin',
      { ...ok, milestones: [{ at: 5, coin: -1, name: 'x' }] },
    ],
    [
      'nested extra field',
      { ...ok, milestones: [{ at: 5, coin: 1, name: 'x', evil: 1 }] },
    ],
    ['extra field', { ...ok, isSettled: true }],
    [
      '11 milestones',
      {
        ...ok,
        milestones: Array.from({ length: 11 }, (_, i) => ({
          at: i + 1,
          coin: 1,
          name: 'x',
        })),
      },
    ],
  ])('rejects %s', async (_n, body) => {
    await expect(pipe.transform(body, meta)).rejects.toBeDefined();
  });
});
