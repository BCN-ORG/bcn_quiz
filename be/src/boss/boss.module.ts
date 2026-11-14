import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { XpModule } from '../xp/xp.module';
import { BossController } from './boss.controller';
import { BossAdminService } from './boss-admin.service';
import { BossLiveService } from './boss-live.service';
import { BossService } from './boss.service';
import { BossCoinService } from './coin/boss-coin.service';
import { BossReconciliationService } from './coin/boss-reconciliation.service';
import { BOSS_COIN_SERVICE_PROVIDER } from './coin/coin-provider.interface';
import { MockBossCoinProvider } from './coin/mock-boss-coin.provider';

@Module({
  imports: [PrismaModule, ProfilesModule, XpModule],
  controllers: [BossController],
  providers: [
    BossService,
    BossLiveService,
    BossAdminService,
    BossCoinService,
    BossReconciliationService,
    MockBossCoinProvider,
    {
      provide: BOSS_COIN_SERVICE_PROVIDER,
      useExisting: MockBossCoinProvider,
    },
  ],
  exports: [
    BossService,
    BossCoinService,
    BossReconciliationService,
    BOSS_COIN_SERVICE_PROVIDER,
  ],
})
export class BossModule {}
