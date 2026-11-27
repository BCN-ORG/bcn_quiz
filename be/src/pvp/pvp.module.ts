import { Module } from '@nestjs/common';
import { CoinModule } from '../coin/coin.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { WalletModule } from '../wallet/wallet.module';
import { XpModule } from '../xp/xp.module';
import { PvpController } from './pvp.controller';
import { PvpService } from './pvp.service';

@Module({
  imports: [PrismaModule, ProfilesModule, XpModule, CoinModule, WalletModule],
  controllers: [PvpController],
  providers: [PvpService],
  exports: [PvpService],
})
export class PvpModule {}
