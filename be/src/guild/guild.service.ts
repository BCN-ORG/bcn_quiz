import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { GuildRole, Prisma } from '@prisma/client';
import { DiscordWebhookService } from '../discord-webhook/discord-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';

@Injectable()
export class GuildService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly profilesService?: ProfilesService,
    @Optional() private readonly discordWebhook?: DiscordWebhookService,
  ) {}

  async listGuilds() {
    const guilds = await this.prisma.guild.findMany({
      include: {
        _count: { select: { members: true } },
        bossStats: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return guilds.map((g) => ({
      id: g.id,
      name: g.name,
      tag: g.tag,
      description: g.description,
      leaderId: g.leaderId,
      memberCount: g._count.members,
      maxMembers: g.maxMembers,
      latestBossDamage: g.bossStats[0]?.totalDamage ?? 0,
    }));
  }

  async getMyGuild(userId: string) {
    const membership = await this.prisma.guildMember.findUnique({
      where: { userId },
      include: {
        guild: {
          include: {
            members: { orderBy: { joinedAt: 'asc' } },
            bossStats: { orderBy: { updatedAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!membership) return { guild: null };

    const memberIds = membership.guild.members.map((m) => m.userId);
    let userMap = new Map<
      string,
      {
        id: string;
        fullName: string | null;
        email: string;
        avatarUrl: string | null;
      }
    >();
    if (this.profilesService && memberIds.length > 0) {
      userMap = await this.profilesService
        .resolveUsers(memberIds)
        .catch(() => userMap);
    }

    // Aggregate current week Boss stats for members
    const activeBoss = await this.prisma.bossWeeklySeason
      .findFirst({
        where: { isActive: true },
        orderBy: { startsAt: 'desc' },
        select: { id: true, name: true },
      })
      .catch(() => null);

    let damageByUser = new Map<string, number>();
    if (activeBoss && memberIds.length > 0) {
      const stats = await this.prisma.bossUserWeeklyStat
        .findMany({
          where: { seasonId: activeBoss.id, userId: { in: memberIds } },
          select: { userId: true, highestScore: true },
        })
        .catch(() => [] as Array<{ userId: string; highestScore: number }>);
      damageByUser = new Map(stats.map((s) => [s.userId, s.highestScore]));
      const totalDamage = stats.reduce((acc, s) => acc + s.highestScore, 0);
      await this.prisma.guildBossContribution
        .upsert({
          where: {
            seasonId_guildId: {
              seasonId: activeBoss.id,
              guildId: membership.guild.id,
            },
          },
          update: { totalDamage, participantCount: stats.length },
          create: {
            seasonId: activeBoss.id,
            guildId: membership.guild.id,
            totalDamage,
            participantCount: stats.length,
          },
        })
        .catch(() => undefined);
    }

    const totalWeeklyDamage = memberIds.reduce(
      (sum, id) => sum + (damageByUser.get(id) ?? 0),
      0,
    );

    return {
      guild: {
        id: membership.guild.id,
        name: membership.guild.name,
        tag: membership.guild.tag,
        description: membership.guild.description,
        leaderId: membership.guild.leaderId,
        myRole: membership.role,
        maxMembers: membership.guild.maxMembers,
        weeklyBossTitle: activeBoss?.name ?? null,
        totalWeeklyDamage,
        members: membership.guild.members.map((m) => {
          const prof = userMap.get(m.userId);
          return {
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
            fullName: prof?.fullName ?? null,
            avatarUrl: prof?.avatarUrl ?? null,
            weeklyDamage: damageByUser.get(m.userId) ?? 0,
          };
        }),
      },
    };
  }

  async createGuild(
    userId: string,
    payload: { name: string; tag: string; description?: string },
  ) {
    const name = payload.name?.trim();
    const tag = payload.tag?.trim().toUpperCase();
    if (!name || name.length < 3 || name.length > 32) {
      throw new BadRequestException('Tên Bang hội phải từ 3 đến 32 ký tự.');
    }
    if (!tag || !/^[A-Z0-9]{2,6}$/.test(tag)) {
      throw new BadRequestException('Tag Bang hội phải gồm 2–6 ký tự chữ/số.');
    }

    const already = await this.prisma.guildMember.findUnique({
      where: { userId },
    });
    if (already) {
      throw new BadRequestException(
        'Bạn đã thuộc một Bang hội. Hãy rời Bang hội hiện tại trước.',
      );
    }

    let guild;
    try {
      guild = await this.prisma.guild.create({
        data: {
          name,
          tag,
          description: payload.description?.trim().slice(0, 200) ?? '',
          leaderId: userId,
          members: {
            create: { userId, role: GuildRole.LEADER },
          },
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Tên hoặc Tag Bang hội này đã tồn tại, vui lòng chọn tên khác.',
        );
      }
      throw err;
    }

    void this.discordWebhook?.sendAnnouncement({
      title: `🛡️ Bang hội mới thành lập: [${guild.tag}] ${guild.name}`,
      description:
        guild.description || 'Một bang hội học tập mới vừa gia nhập BCN Arena!',
      color: 0x10b981,
    });

    return guild;
  }

  async joinGuild(userId: string, guildId: string) {
    const already = await this.prisma.guildMember.findUnique({
      where: { userId },
    });
    if (already) {
      throw new BadRequestException('Bạn đã gia nhập một Bang hội rồi.');
    }

    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: { _count: { select: { members: true } } },
    });
    if (!guild) {
      throw new NotFoundException('Không tìm thấy Bang hội.');
    }
    if (guild._count.members >= guild.maxMembers) {
      throw new BadRequestException('Bang hội đã đủ số lượng thành viên.');
    }

    return this.prisma.guildMember.create({
      data: { guildId, userId, role: GuildRole.MEMBER },
    });
  }

  async leaveGuild(userId: string) {
    const member = await this.prisma.guildMember.findUnique({
      where: { userId },
    });
    if (!member) {
      throw new BadRequestException('Bạn chưa thuộc Bang hội nào.');
    }
    await this.prisma.guildMember.delete({ where: { id: member.id } });

    const remaining = await this.prisma.guildMember.findFirst({
      where: { guildId: member.guildId },
      orderBy: { joinedAt: 'asc' },
    });
    if (!remaining) {
      await this.prisma.guild.delete({ where: { id: member.guildId } });
    } else if (member.role === GuildRole.LEADER) {
      await this.prisma.$transaction([
        this.prisma.guildMember.update({
          where: { id: remaining.id },
          data: { role: GuildRole.LEADER },
        }),
        this.prisma.guild.update({
          where: { id: member.guildId },
          data: { leaderId: remaining.userId },
        }),
      ]);
    }
    return { left: true };
  }

  async getGuildBossLeaderboard() {
    const activeBoss = await this.prisma.bossWeeklySeason
      .findFirst({
        where: { isActive: true },
        orderBy: { startsAt: 'desc' },
        select: { id: true, name: true },
      })
      .catch(() => null);
    if (!activeBoss) return { seasonTitle: null, leaderboard: [] };

    const rows = await this.prisma.guildBossContribution.findMany({
      where: { seasonId: activeBoss.id },
      include: { guild: { select: { id: true, name: true, tag: true } } },
      orderBy: { totalDamage: 'desc' },
      take: 20,
    });

    return {
      seasonTitle: activeBoss.name,
      leaderboard: rows.map((r, idx) => ({
        rank: idx + 1,
        guildId: r.guild.id,
        name: r.guild.name,
        tag: r.guild.tag,
        totalDamage: r.totalDamage,
        participantCount: r.participantCount,
      })),
    };
  }

  // --------------------------------------------------------------------------
  // ADMIN MANAGEMENT
  // --------------------------------------------------------------------------

  async listAdminGuilds() {
    const guilds = await this.prisma.guild.findMany({
      include: {
        _count: { select: { members: true } },
        bossStats: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const leaderIds = Array.from(new Set(guilds.map((g) => g.leaderId)));
    const profiles =
      this.profilesService && leaderIds.length > 0
        ? await this.profilesService
            .resolveUsers(leaderIds)
            .catch(() => new Map())
        : new Map();

    return guilds.map((g) => ({
      id: g.id,
      name: g.name,
      tag: g.tag,
      description: g.description,
      leaderId: g.leaderId,
      leaderName: profiles.get(g.leaderId)?.fullName ?? g.leaderId,
      memberCount: g._count.members,
      maxMembers: g.maxMembers,
      latestBossDamage: g.bossStats[0]?.totalDamage ?? 0,
      createdAt: g.createdAt.toISOString(),
    }));
  }

  async getAdminGuildDetail(guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: {
        members: { orderBy: { joinedAt: 'asc' } },
        bossStats: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    });
    if (!guild) {
      throw new NotFoundException('Không tìm thấy Bang hội.');
    }

    const memberIds = guild.members.map((m) => m.userId);
    const profiles =
      this.profilesService && memberIds.length > 0
        ? await this.profilesService
            .resolveUsers(memberIds)
            .catch(() => new Map())
        : new Map();

    return {
      id: guild.id,
      name: guild.name,
      tag: guild.tag,
      description: guild.description,
      leaderId: guild.leaderId,
      maxMembers: guild.maxMembers,
      latestBossDamage: guild.bossStats[0]?.totalDamage ?? 0,
      createdAt: guild.createdAt.toISOString(),
      members: guild.members.map((m) => {
        const prof = profiles.get(m.userId);
        return {
          userId: m.userId,
          role: m.role,
          fullName: prof?.fullName ?? null,
          email: prof?.email ?? null,
          joinedAt: m.joinedAt.toISOString(),
        };
      }),
    };
  }

  async updateAdminGuild(
    guildId: string,
    dto: {
      name?: string;
      tag?: string;
      description?: string;
      maxMembers?: number;
    },
  ) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: { _count: { select: { members: true } } },
    });
    if (!guild) {
      throw new NotFoundException('Không tìm thấy Bang hội.');
    }

    const name =
      dto.name !== undefined
        ? typeof dto.name === 'string'
          ? dto.name.trim()
          : ''
        : guild.name;
    const tag =
      dto.tag !== undefined
        ? typeof dto.tag === 'string'
          ? dto.tag.trim().toUpperCase()
          : ''
        : guild.tag;
    const description =
      dto.description !== undefined
        ? typeof dto.description === 'string'
          ? dto.description.trim().slice(0, 240)
          : ''
        : guild.description;
    const rawMax =
      dto.maxMembers !== undefined ? Number(dto.maxMembers) : guild.maxMembers;
    if (!Number.isFinite(rawMax)) {
      throw new BadRequestException('Sức chứa thành viên không hợp lệ.');
    }
    const maxMembers = Math.floor(rawMax);

    if (name.length < 3 || name.length > 32) {
      throw new BadRequestException('Tên Bang hội phải từ 3 đến 32 ký tự.');
    }
    if (!/^[A-Z0-9]{2,6}$/.test(tag)) {
      throw new BadRequestException('Tag Bang hội phải gồm 2–6 ký tự chữ/số.');
    }
    if (maxMembers < guild._count.members || maxMembers > 50) {
      throw new BadRequestException(
        `Sức chứa phải từ ${guild._count.members} đến 50 thành viên.`,
      );
    }

    try {
      return await this.prisma.guild.update({
        where: { id: guildId },
        data: { name, tag, description, maxMembers },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Tên hoặc Tag Bang hội đã tồn tại.');
      }
      throw error;
    }
  }

  async kickAdminMember(guildId: string, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const member = await tx.guildMember.findFirst({
          where: { guildId, userId },
        });
        if (!member) {
          throw new NotFoundException(
            'Không tìm thấy thành viên trong Bang hội này.',
          );
        }
        await tx.guildMember.delete({ where: { id: member.id } });

        const remaining = await tx.guildMember.findFirst({
          where: { guildId },
          orderBy: { joinedAt: 'asc' },
        });
        if (!remaining) {
          await tx.guild.delete({ where: { id: guildId } });
          return { kicked: true, guildDeleted: true };
        }
        if (member.role === GuildRole.LEADER) {
          await tx.guildMember.update({
            where: { id: remaining.id },
            data: { role: GuildRole.LEADER },
          });
          await tx.guild.update({
            where: { id: guildId },
            data: { leaderId: remaining.userId },
          });
        }
        return { kicked: true, guildDeleted: false };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          'Thành viên hoặc Bang hội không còn tồn tại.',
        );
      }
      throw error;
    }
  }

  async deleteAdminGuild(guildId: string) {
    const existing = await this.prisma.guild.findUnique({
      where: { id: guildId },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy Bang hội.');
    }
    await this.prisma.guild.delete({ where: { id: guildId } });
    return { deleted: true, id: guildId };
  }
}
