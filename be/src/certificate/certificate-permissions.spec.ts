import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CertificateAdminController } from './certificate-admin.controller';
import { CertificateController } from './certificate.controller';

/**
 * Who may review certificate requests is decided on the server: every admin handler goes through the real RolesGuard
 * with the real decorator metadata. A learner (even one who can read questions) must be refused.
 */
const context = (handler: string, user?: unknown) =>
  ({
    getHandler: () =>
      (
        CertificateAdminController.prototype as unknown as Record<
          string,
          () => void
        >
      )[handler],
    getClass: () => CertificateAdminController,
    switchToHttp: () => ({
      getRequest: () => ({ user, method: 'GET', originalUrl: `/${handler}` }),
    }),
  }) as unknown as ExecutionContext;

const users = {
  none: undefined,
  noPermissions: { id: 'u', permissions: [] },
  resultOnly: { id: 'u', permissions: ['quiz.result.read'] },
  learner: { id: 'u', permissions: ['quiz.question.read', 'quiz.result.read'] },
  mentor: {
    id: 'u',
    permissions: ['quiz.question.read', 'quiz.question.update'],
  },
};
const expected: Record<
  keyof typeof users,
  'ok' | 'forbidden' | 'unauthorized'
> = {
  none: 'unauthorized',
  noPermissions: 'forbidden',
  resultOnly: 'forbidden',
  learner: 'forbidden',
  mentor: 'ok',
};

describe('certificate request authorization matrix', () => {
  const guard = new RolesGuard(new Reflector());
  for (const handler of ['list', 'detail', 'review', 'revoke']) {
    for (const [who, user] of Object.entries(users) as Array<
      [keyof typeof users, unknown]
    >) {
      it(`admin ${handler} as ${who}: ${expected[who]}`, () => {
        const run = () => guard.canActivate(context(handler, user));
        if (expected[who] === 'ok') expect(run()).toBe(true);
        else if (expected[who] === 'forbidden')
          expect(run).toThrow(ForbiddenException);
        else expect(run).toThrow(UnauthorizedException);
      });
    }
  }
});

describe('certificate routes', () => {
  const path = (target: object, handler: string) => {
    const fn = (target as Record<string, () => void>)[handler];
    return String(Reflect.getMetadata('path', fn));
  };

  it('keeps the admin review under /admin and the learner routes self-service', () => {
    expect(Reflect.getMetadata('path', CertificateAdminController)).toBe(
      'admin/certificate-requests',
    );
    expect(path(CertificateAdminController.prototype, 'review')).toBe(
      ':id/review',
    );
    expect(path(CertificateAdminController.prototype, 'revoke')).toBe(
      ':id/revoke',
    );
    expect(path(CertificateController.prototype, 'myRequests')).toBe(
      'requests/me',
    );
    expect(path(CertificateController.prototype, 'resubmit')).toBe(
      'requests/:courseId/resubmit',
    );
  });
});
