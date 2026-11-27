import { BadRequestException } from '@nestjs/common';
import { GuildService } from './guild.service';

describe('GuildService', () => {
  it('validates guild tag and prevents joining when already a member', async () => {
    const prisma = {
      guildMember: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      guild: {
        create: jest.fn().mockResolvedValue({
          id: 'g1',
          name: 'BCN Legends',
          tag: 'BCN',
          description: 'Team',
        }),
      },
    };
    const svc = new GuildService(prisma as never);
    await expect(
      svc.createGuild('u1', { name: 'AB', tag: '!' }),
    ).rejects.toThrow(BadRequestException);

    const created = await svc.createGuild('u1', {
      name: 'BCN Legends',
      tag: 'bcn',
      description: 'Team',
    });
    expect(created.tag).toBe('BCN');
  });
});
