import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { XpModule } from '../xp/xp.module';
import { BossController } from './boss.controller';
import { BossService } from './boss.service';
import { BossCoinService } from './coin/boss-coin.service';
import { BossReconciliationService } from './coin/boss-reconciliation.service';
import { BOSS_COIN_SERVICE_PROVIDER } from './coin/coin-provider.interface';
import { MockBossCoinProvider } from './coin/mock-boss-coin.provider';

@Module({
  imports: [PrismaModule, XpModule],
  controllers: [BossController],
  providers: [
    BossService,
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
