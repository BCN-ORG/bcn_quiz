import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

function mockContext(user?: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        method: 'GET',
        originalUrl: '/admin',
      }),
    }),
  } as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows public routes without roles', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });

    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('allows when no roles or permissions are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({ id: 'u1' }))).toBe(true);
  });

  it('allows when user has required permission', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PERMISSIONS_KEY) return ['quiz.question.delete'];
      return undefined;
    });

    expect(
      guard.canActivate(
        mockContext({
          permissions: ['quiz.question.create', 'quiz.question.delete'],
        }),
      ),
    ).toBe(true);
  });

  it('forbids when required permission is missing', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PERMISSIONS_KEY) return ['quiz.question.delete'];
      return undefined;
    });

    expect(() =>
      guard.canActivate(mockContext({ permissions: ['quiz.question.create'] })),
    ).toThrow(ForbiddenException);
  });

  it('prefers permissions over roles when both metadata exist', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PERMISSIONS_KEY) return ['quiz.question.delete'];
      if (key === ROLES_KEY) return ['admin'];
      return undefined;
    });

    expect(() =>
      guard.canActivate(mockContext({ roles: ['admin'], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows mentor app role from profiles payload (legacy @Roles)', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['admin', 'mentor'];
      return undefined;
    });

    expect(
      guard.canActivate(mockContext({ data: { roles: ['member', 'mentor'] } })),
    ).toBe(true);
  });

  it('forbids mentor on admin-only role routes', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['admin'];
      return undefined;
    });

    expect(() =>
      guard.canActivate(mockContext({ data: { roles: ['mentor'] } })),
    ).toThrow(ForbiddenException);
  });

  it('forbids platform ADMIN when QUIZ app role is only mentor', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return ['admin'];
      return undefined;
    });

    expect(() =>
      guard.canActivate(
        mockContext({ role: 'ADMIN', data: { roles: ['mentor'] } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('throws when user missing', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PERMISSIONS_KEY) return ['quiz.question.delete'];
      return undefined;
    });

    expect(() => guard.canActivate(mockContext())).toThrow(
      UnauthorizedException,
    );
  });
});
