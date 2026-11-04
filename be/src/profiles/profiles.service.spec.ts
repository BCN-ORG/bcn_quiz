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
  afterEach(() => {
    jest.restoreAllMocks();
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
  describe('resolveUsersDetailed tells a failed lookup from an empty answer', () => {
    const service = (get: jest.Mock) =>
      new ProfilesService({ get } as unknown as HttpService);

    it('is not failed when Profiles answers, even without a matching user', async () => {
      const get = jest.fn().mockReturnValue(of({ data: { users: [] } }));
      expect(await service(get).resolveUsersDetailed(['ghost'])).toEqual({
        users: new Map(),
        failed: false,
      });
    });

    it('is not failed for an empty id list and makes no request', async () => {
      const get = jest.fn();
      expect(await service(get).resolveUsersDetailed([])).toEqual({
        users: new Map(),
        failed: false,
      });
      expect(get).not.toHaveBeenCalled();
    });

    it('is failed on 401 and on a network error, and resolveUsers still returns an empty map', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const unauthorized = Object.assign(new AxiosError('Unauthorized'), {
        response: { status: 401 },
      });
      for (const error of [
        unauthorized,
        new AxiosError('connect ECONNREFUSED'),
      ]) {
        const get = jest.fn().mockReturnValue(throwError(() => error));
        expect(await service(get).resolveUsersDetailed(['u1'])).toEqual({
          users: new Map(),
          failed: true,
        });
        expect(await service(get).resolveUsers(['u1'])).toEqual(new Map());
      }
    });

    it('warns about a missing server key once, not on every call', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      delete process.env.PROFILES_CLIENT_SECRET;
      const instance = service(jest.fn());
      await instance.resolveUsersDetailed(['u1']);
      await instance.resolveUsersDetailed(['u2']);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('is failed when the server key is not configured (outside production) and makes no request', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      delete process.env.PROFILES_CLIENT_SECRET;
      const get = jest.fn();
      expect(await service(get).resolveUsersDetailed(['u1'])).toEqual({
        users: new Map(),
        failed: true,
      });
      expect(get).not.toHaveBeenCalled();
    });
  });
});
