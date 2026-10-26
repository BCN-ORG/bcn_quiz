import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { ProfilesService } from './profiles.service';

describe('ProfilesService internal user lookup', () => {
  const keys = [
    'PROFILES_API_BASE_URL',
    'BCN_OAUTH_CLIENT_ID',
    'PROFILES_CLIENT_SECRET',
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    process.env.PROFILES_API_BASE_URL = 'http://profiles:3000/api';
    process.env.BCN_OAUTH_CLIENT_ID = 'bcn-quiz';
    process.env.PROFILES_CLIENT_SECRET = 'test-server-key';
  });
  afterAll(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it('uses the same Basic credentials and internal path for search and batch resolve', async () => {
    const get = jest
      .fn()
      .mockReturnValueOnce(
        of({ data: { data: { users: [{ id: 'user-1' }], total: 1 } } }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            data: { users: [{ id: 'user-1', fullName: 'Nguyễn Văn Minh' }] },
          },
        }),
      );
    const service = new ProfilesService({ get } as unknown as HttpService);

    expect(await service.searchUserIds('Minh')).toEqual(['user-1']);
    expect(
      (await service.resolveUsers(['user-1'])).get('user-1')?.fullName,
    ).toBe('Nguyễn Văn Minh');
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      'http://profiles:3000/api/internal/users/search',
      'http://profiles:3000/api/internal/users',
    ]);
    for (const [, options] of get.mock.calls) {
      expect(options.headers.Authorization).toBe(
        `Basic ${Buffer.from('bcn-quiz:test-server-key').toString('base64')}`,
      );
    }
  });

  it('reports Profiles authentication failure safely for search and resolve', async () => {
    const error = Object.assign(new AxiosError('Unauthorized'), {
      response: { status: 401 },
    });
    const get = jest.fn().mockReturnValue(throwError(() => error));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = new ProfilesService({ get } as unknown as HttpService);

    await expect(service.searchUserIds('Minh')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(await service.resolveUsers(['user-1'])).toEqual(new Map());
    expect(warn).toHaveBeenCalledWith('[ProfilesSearchAuthFailed] status=401');
    expect(warn).toHaveBeenCalledWith('[ProfilesResolveAuthFailed] status=401');
    warn.mockRestore();
  });
});
