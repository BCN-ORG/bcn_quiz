import { Module } from '@nestjs/common';
import { CoinModule } from '../coin/coin.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { XpModule } from '../xp/xp.module';
import { MistakeController } from './mistake.controller';
import { MistakeService } from './mistake.service';

@Module({
  imports: [PrismaModule, XpModule, CoinModule, WalletModule],
  controllers: [MistakeController],
  providers: [MistakeService],
  exports: [MistakeService],
})
export class MistakeModule {}
