import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoinApiClient, getCoinProviderMode } from '../coin/coin-api.client';
import { CoinConfigService } from '../coin/coin-config.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { CoinWalletService } from './coin-wallet.interface';
import { LiveCoinWalletService } from './live-coin-wallet.service';
import { MockCoinWalletService } from './mock-coin-wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [AuthModule, ProfilesModule, PrismaModule, HttpModule],
  controllers: [WalletController],
  providers: [
    CoinApiClient,
    CoinConfigService,
    MockCoinWalletService,
    LiveCoinWalletService,
    {
      provide: CoinWalletService,
      useFactory: (
        mockService: MockCoinWalletService,
        liveService: LiveCoinWalletService,
      ) => (getCoinProviderMode() === 'live' ? liveService : mockService),
      inject: [MockCoinWalletService, LiveCoinWalletService],
    },
  ],
  exports: [
    CoinWalletService,
    MockCoinWalletService,
    LiveCoinWalletService,
    CoinApiClient,
    CoinConfigService,
  ],
})
export class WalletModule {}
