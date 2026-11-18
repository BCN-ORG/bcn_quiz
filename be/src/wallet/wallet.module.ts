import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { CoinWalletService } from './coin-wallet.interface';
import { MockCoinWalletService } from './mock-coin-wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [ProfilesModule],
  controllers: [WalletController],
  providers: [
    MockCoinWalletService,
    {
      provide: CoinWalletService,
      useExisting: MockCoinWalletService,
    },
  ],
  exports: [CoinWalletService, MockCoinWalletService],
})
export class WalletModule {}
