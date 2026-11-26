import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LiveCoinWalletService } from './live-coin-wallet.service';

describe('LiveCoinWalletService', () => {
  function setup(overrides?: {
    transfersEnabled?: boolean;
    senderDiscordId?: string | null;
    recipientDiscordId?: string | null;
  }) {
    const prisma = {
      coinSystemConfig: {
        findUnique: jest.fn().mockResolvedValue({
          transfersEnabled: overrides?.transfersEnabled ?? true,
        }),
      },
    };
    const profilesService = {
      resolveDiscordId: jest.fn().mockImplementation((id: string) => {
        if (id === 'usr_sender') {
          return Promise.resolve(
            overrides?.senderDiscordId !== undefined
              ? overrides.senderDiscordId
              : '966153253400231988',
          );
        }
        if (id === 'usr_recipient') {
          return Promise.resolve(
            overrides?.recipientDiscordId !== undefined
              ? overrides.recipientDiscordId
              : '1338020421328437278',
          );
        }
        return Promise.resolve(null);
      }),
      searchUsers: jest.fn().mockResolvedValue([
        {
          id: 'usr_sender',
          fullName: 'Sender',
          avatarUrl: null,
          discordId: '966153253400231988',
        },
        {
          id: 'usr_recipient',
          fullName: 'Recipient',
          avatarUrl: null,
          discordId: '1338020421328437278',
        },
        {
          id: 'usr_unlinked',
          fullName: 'Unlinked',
          avatarUrl: null,
          discordId: null,
        },
      ]),
    };
    const coinApiClient = {
      getBalance: jest.fn().mockResolvedValue({
        userId: '966153253400231988',
        balance: 90,
        lockedBalance: 0,
        currency: 'COIN',
        lastSyncedAt: '2026-11-23T00:00:00.000Z',
        syncStatus: 'SYNCED',
      }),
      getTransactions: jest.fn().mockResolvedValue({
        items: [
          {
            id: null,
            type: 'SALARY',
            amount: 50,
            balanceAfter: 90,
            title: 'Lương tháng',
            description: null,
            counterparty: null,
            status: 'SUCCESS',
            createdAt: '2026-11-23T00:00:00.000Z',
          },
        ],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
      transfer: jest.fn().mockResolvedValue({
        transactionId: 'coin_tx_5f0c2b9a1d3e4f60',
        senderId: '966153253400231988',
        recipientId: '1338020421328437278',
        amount: 20,
        senderBalance: 70,
        status: 'SUCCESS',
        createdAt: '2026-11-23T00:00:00.000Z',
      }),
    };

    return {
      service: new LiveCoinWalletService(
        prisma as any,
        profilesService as any,
        coinApiClient as any,
      ),
      coinApiClient,
    };
  }

  it('strips raw discordId and exposes discordLinked in searchUsers', async () => {
    const { service } = setup();
    const res = await service.searchUsers('usr_sender', 'user');
    expect(res).toEqual([
      {
        id: 'usr_recipient',
        fullName: 'Recipient',
        avatarUrl: null,
        discordLinked: true,
      },
      {
        id: 'usr_unlinked',
        fullName: 'Unlinked',
        avatarUrl: null,
        discordLinked: false,
      },
    ]);
    expect((res[0] as any).discordId).toBeUndefined();
  });

  it('rejects transfer when sender/recipient lacks Discord or transfersEnabled=false', async () => {
    const { service: noRecip } = setup({ recipientDiscordId: null });
    await expect(
      noRecip.transferCoin(
        'usr_sender',
        'Sender',
        'usr_recipient',
        10,
        'idem-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { service: disabled } = setup({ transfersEnabled: false });
    await expect(
      disabled.transferCoin(
        'usr_sender',
        'Sender',
        'usr_recipient',
        10,
        'idem-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transfers using Discord IDs and returns transactionId', async () => {
    const { service, coinApiClient } = setup();
    const res = await service.transferCoin(
      'usr_sender',
      'Sender',
      'usr_recipient',
      20,
      'idem-3',
      'Thưởng quiz',
    );
    expect(coinApiClient.transfer).toHaveBeenCalledWith({
      senderId: '966153253400231988',
      recipientId: '1338020421328437278',
      amount: 20,
      idempotencyKey: 'idem-3',
      description: 'Thưởng quiz',
    });
    expect(res.transaction.id).toBe('coin_tx_5f0c2b9a1d3e4f60');
    expect(res.senderBalance).toBe(70);
  });

  it('preserves id: null for Discord-native transactions in history', async () => {
    const { service } = setup();
    const history = await service.getTransactionHistory('usr_sender', {
      page: 1,
      limit: 20,
      type: 'ALL',
    });
    expect(history.transactions[0].id).toBeNull();
    expect(history.transactions[0].type).toBe('SALARY');
  });

  it('rejects transferToDiscordId when sender Discord ID matches recipientDiscordId', async () => {
    const { service, coinApiClient } = setup();
    await expect(
      service.transferToDiscordId(
        'usr_sender',
        'Sender',
        '966153253400231988',
        50,
        'idem-self',
      ),
    ).rejects.toThrow('Không thể tự chuyển Coin cho chính mình');
    expect(coinApiClient.transfer).not.toHaveBeenCalled();
  });
});
