import { Module } from '@nestjs/common';
import { CoinModule } from '../coin/coin.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { WalletModule } from '../wallet/wallet.module';
import { SeasonPassController } from './season-pass.controller';
import { SeasonPassService } from './season-pass.service';

@Module({
  imports: [PrismaModule, CoinModule, WalletModule, ProfilesModule],
  controllers: [SeasonPassController],
  providers: [SeasonPassService],
  exports: [SeasonPassService],
})
export class SeasonPassModule {}
