import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { CoinWalletService } from './coin-wallet.interface';
import { MockCoinWalletService } from './mock-coin-wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [AuthModule, ProfilesModule],
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
