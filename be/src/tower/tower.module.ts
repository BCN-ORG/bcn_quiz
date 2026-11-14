import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { XpModule } from '../xp/xp.module';
import { TowerController } from './tower.controller';
import { TowerService } from './tower.service';
import { TowerCoinService } from './coin/tower-coin.service';
import { TowerReconciliationService } from './coin/tower-reconciliation.service';
import { COIN_SERVICE_PROVIDER } from './coin/coin-provider.interface';
import { MockCoinProvider } from './coin/mock-coin.provider';

@Module({
  imports: [PrismaModule, XpModule],
  controllers: [TowerController],
  providers: [
    TowerService,
    TowerCoinService,
    TowerReconciliationService,
    MockCoinProvider,
    {
      provide: COIN_SERVICE_PROVIDER,
      useExisting: MockCoinProvider,
    },
  ],
  exports: [
    TowerService,
    TowerCoinService,
    TowerReconciliationService,
    COIN_SERVICE_PROVIDER,
  ],
})
export class TowerModule {}
