import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { BearerAuthGuard } from '../auth/guards/auth.guard';
import { CoinWalletService } from './coin-wallet.interface';
import {
  SearchUsersQueryDto,
  TransferCoinDto,
  WalletHistoryQueryDto,
} from './dto/wallet.dto';

@Controller('wallet')
@UseGuards(BearerAuthGuard)
export class WalletController {
  constructor(private readonly walletService: CoinWalletService) {}

  @Get('balance')
  async getBalance(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.walletService.getBalance(userId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncBalance(@Request() req: ExpressRequest) {
    const userId = this.extractUserId(req);
    return this.walletService.syncBalance(userId);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async transferCoin(
    @Request() req: ExpressRequest,
    @Body() dto: TransferCoinDto,
  ) {
    const userId = this.extractUserId(req);
    const senderName = this.extractUserName(req);
    return this.walletService.transferCoin(
      userId,
      senderName,
      dto.recipientId,
      dto.amount,
      dto.idempotencyKey,
      dto.description || dto.note,
    );
  }

  @Get('transactions')
  async getTransactions(
    @Request() req: ExpressRequest,
    @Query() query: WalletHistoryQueryDto,
  ) {
    const userId = this.extractUserId(req);
    return this.walletService.getTransactionHistory(userId, query);
  }

  @Get('transactions/:id')
  async getTransactionDetail(
    @Request() req: ExpressRequest,
    @Param('id') id: string,
  ) {
    const userId = this.extractUserId(req);
    return this.walletService.getTransactionDetail(userId, id);
  }

  @Get('users/search')
  async searchUsers(
    @Request() req: ExpressRequest,
    @Query() query: SearchUsersQueryDto,
  ) {
    const userId = this.extractUserId(req);
    return this.walletService.searchUsers(userId, query.q ?? '');
  }

  private extractUserId(req: ExpressRequest): string {
    const user = (
      req as ExpressRequest & {
        user?: {
          id?: unknown;
          sub?: unknown;
          user?: { id?: unknown };
          data?: { id?: unknown; user?: { id?: unknown } };
        };
      }
    ).user;

    const candidates = [
      user?.id,
      user?.sub,
      user?.user?.id,
      user?.data?.id,
      user?.data?.user?.id,
    ];

    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return c;
    }
    throw new UnauthorizedException(
      'Vui lòng đăng nhập để thực hiện thao tác ví coin.',
    );
  }

  private extractUserName(req: ExpressRequest): string {
    const user = (
      req as ExpressRequest & {
        user?: {
          fullName?: unknown;
          name?: unknown;
          username?: unknown;
          email?: unknown;
          data?: {
            fullName?: unknown;
            name?: unknown;
            username?: unknown;
          };
          user?: {
            fullName?: unknown;
            name?: unknown;
            username?: unknown;
          };
        };
      }
    ).user;

    const candidates = [
      user?.fullName,
      user?.name,
      user?.username,
      user?.data?.fullName,
      user?.data?.name,
      user?.data?.username,
      user?.user?.fullName,
      user?.user?.name,
      user?.user?.username,
    ];

    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) return c.trim();
    }
    return 'Người dùng';
  }
}
