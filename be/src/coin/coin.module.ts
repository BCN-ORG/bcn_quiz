import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { WalletModule } from '../wallet/wallet.module';
import { CoinAdminController } from './coin-admin.controller';
import { CoinAdminService } from './coin-admin.service';
import { CoinTrackingService } from './coin-tracking.service';

@Module({
  imports: [PrismaModule, ProfilesModule, WalletModule],
  controllers: [CoinAdminController],
  providers: [CoinTrackingService, CoinAdminService],
  exports: [CoinTrackingService, CoinAdminService],
})
export class CoinModule {}
