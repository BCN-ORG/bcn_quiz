import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MockWalletTxStatus, MockWalletTxType } from '@prisma/client';

export class WalletHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(MockWalletTxType)
  type?: MockWalletTxType;

  @IsOptional()
  @IsEnum(MockWalletTxStatus)
  status?: MockWalletTxStatus;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class TransferCoinDto {
  @IsNotEmpty({ message: 'Người nhận không được để trống' })
  @IsString()
  recipientId: string;

  @IsNotEmpty({ message: 'Số lượng coin chuyển không được để trống' })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng coin phải là số nguyên' })
  @Min(1, { message: 'Số lượng coin phải lớn hơn 0' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class SearchUsersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
