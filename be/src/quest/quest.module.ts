import { Module } from '@nestjs/common';
import { CoinModule } from '../coin/coin.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { XpModule } from '../xp/xp.module';
import { QuestController } from './quest.controller';
import { QuestService } from './quest.service';

@Module({
  imports: [PrismaModule, XpModule, CoinModule, WalletModule],
  controllers: [QuestController],
  providers: [QuestService],
  exports: [QuestService],
})
export class QuestModule {}
