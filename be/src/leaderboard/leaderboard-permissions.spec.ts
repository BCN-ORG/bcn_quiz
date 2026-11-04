import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminLeaderboardController,
  LeaderboardController,
} from './leaderboard.controller';

/**
 * Authorization matrix for every leaderboard endpoint, run through the real RolesGuard and the real decorator
 * metadata of each handler: who may call what is decided on the server, not by hiding buttons.
 */
type Controller =
  typeof LeaderboardController | typeof AdminLeaderboardController;

const context = (controller: Controller, handler: string, user?: unknown) =>
  ({
    getHandler: () =>
      (controller.prototype as unknown as Record<string, () => void>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user, method: 'GET', originalUrl: `/${handler}` }),
    }),
  }) as unknown as ExecutionContext;

const handlers: Array<[string, Controller, string]> = [
  ['GET /leaderboards/topics/:id/daily', LeaderboardController, 'daily'],
  ['GET /leaderboards/topics/:id/weekly', LeaderboardController, 'weekly'],
  [
    'GET /admin/leaderboards/topics/:id/daily',
    AdminLeaderboardController,
    'daily',
  ],
  [
    'GET /admin/leaderboards/topics/:id/weekly',
    AdminLeaderboardController,
    'weekly',
  ],
  [
    'GET /admin/leaderboards/topics/:id/daily/export',
    AdminLeaderboardController,
    'exportDaily',
  ],
  [
    'GET /admin/leaderboards/topics/:id/weekly/export',
    AdminLeaderboardController,
    'exportWeekly',
  ],
];

const users = {
  none: undefined,
  noPermissions: { id: 'u', permissions: [] },
  resultOnly: { id: 'u', permissions: ['quiz.result.read'] },
  member: { id: 'u', permissions: ['quiz.question.read', 'quiz.result.read'] },
  mentor: {
    id: 'u',
    permissions: ['quiz.question.read', 'quiz.question.update'],
  },
};

// expected: 'ok' | 'forbidden' | 'unauthorized'
const matrix: Record<
  string,
  Record<keyof typeof users, 'ok' | 'forbidden' | 'unauthorized'>
> = {
  member: {
    none: 'unauthorized',
    noPermissions: 'forbidden',
    resultOnly: 'forbidden',
    member: 'ok',
    mentor: 'ok',
  },
  admin: {
    none: 'unauthorized',
    noPermissions: 'forbidden',
    resultOnly: 'forbidden',
    member: 'forbidden',
    mentor: 'ok',
  },
};

describe('leaderboard authorization matrix', () => {
  const guard = new RolesGuard(new Reflector());

  for (const [label, controller, handler] of handlers) {
    const kind = controller === LeaderboardController ? 'member' : 'admin';
    for (const [who, user] of Object.entries(users) as Array<
      [keyof typeof users, unknown]
    >) {
      const expected = matrix[kind][who];
      it(`${label} as ${who}: ${expected}`, () => {
        const run = () => guard.canActivate(context(controller, handler, user));
        if (expected === 'ok') expect(run()).toBe(true);
        else if (expected === 'forbidden')
          expect(run).toThrow(ForbiddenException);
        else expect(run).toThrow(UnauthorizedException);
      });
    }
  }
});
