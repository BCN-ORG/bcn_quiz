import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Response,
  StreamableFile,
} from '@nestjs/common';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CONTENT_UPDATE } from '../auth/quiz-permissions';
import { CoinAdminService } from './coin-admin.service';
import {
  CoinExportQueryDto,
  CoinTransactionQueryDto,
  UserRewardsQueryDto,
} from './dto/coin-admin.dto';

@Controller('admin/coins')
export class CoinAdminController {
  constructor(private readonly coinAdminService: CoinAdminService) {}

  @Permissions(...CONTENT_UPDATE)
  @Get('overview')
  async getOverview() {
    return this.coinAdminService.getOverview();
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('transactions')
  async getTransactions(@Query() query: CoinTransactionQueryDto) {
    return this.coinAdminService.getTransactions(query);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('transactions/:id')
  async getTransactionById(@Param('id') id: string) {
    return this.coinAdminService.getTransactionById(id);
  }

  @Permissions(...CONTENT_UPDATE)
  @Post('transactions/:id/reconcile')
  async reconcileTransaction(
    @Param('id') id: string,
    @Request() req: ExpressRequest,
  ) {
    const adminUserId =
      (req as ExpressRequest & { user?: { id?: string } }).user?.id ??
      'ADMIN_MANUAL';
    return this.coinAdminService.reconcileTransaction(id, adminUserId);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('users/:userId/rewards')
  async getUserRewards(
    @Param('userId') userId: string,
    @Query() query: UserRewardsQueryDto,
  ) {
    return this.coinAdminService.getUserRewardHistory(userId, query);
  }

  @Permissions(...CONTENT_UPDATE)
  @Get('export')
  async exportCsv(
    @Query() query: CoinExportQueryDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const { buffer, filename } =
      await this.coinAdminService.exportTransactionsCsv(query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');

    return new StreamableFile(buffer);
  }
}
