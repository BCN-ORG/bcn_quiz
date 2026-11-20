import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { XpController } from './xp.controller';
import { XpService } from './xp.service';

@Module({
  imports: [PrismaModule, WalletModule],
  controllers: [XpController],
  providers: [XpService],
  exports: [XpService],
})
export class XpModule {}
