import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { GuildController } from './guild.controller';
import { GuildService } from './guild.service';

@Module({
  imports: [PrismaModule, ProfilesModule],
  controllers: [GuildController],
  providers: [GuildService],
  exports: [GuildService],
})
export class GuildModule {}
