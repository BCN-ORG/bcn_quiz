import { ForbiddenException } from '@nestjs/common';
import { XpController } from './xp.controller';
import { XpService } from './xp.service';

describe('XpController', () => {
  let controller: XpController;
  let xpService: { getSummary: jest.Mock };

  beforeEach(() => {
    xpService = { getSummary: jest.fn() };
    controller = new XpController(xpService as unknown as XpService);
  });

  it('delegates getMe to xpService with extracted user id', async () => {
    const summary = { totalXp: 100, level: 1 };
    xpService.getSummary.mockResolvedValue(summary);

    const req = { user: { id: 'user-123' } } as never;
    const res = await controller.getMe(req);

    expect(xpService.getSummary).toHaveBeenCalledWith('user-123');
    expect(res).toBe(summary);
  });

  it('resolves user id from sub when id is omitted', async () => {
    xpService.getSummary.mockResolvedValue({});
    const req = { user: { sub: 'sub-456' } } as never;
    await controller.getMe(req);
    expect(xpService.getSummary).toHaveBeenCalledWith('sub-456');
  });

  it('throws ForbiddenException when user id cannot be resolved', async () => {
    const req = { user: {} } as never;
    await expect(controller.getMe(req)).rejects.toThrow(ForbiddenException);
    expect(xpService.getSummary).not.toHaveBeenCalled();
  });
});
