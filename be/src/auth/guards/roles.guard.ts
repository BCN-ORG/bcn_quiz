import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

type AuthzUser = {
  role?: unknown;
  roles?: unknown;
  permissions?: unknown;
  data?: {
    role?: unknown;
    roles?: unknown;
    permissions?: unknown;
    user?: {
      role?: unknown;
      roles?: unknown;
      permissions?: unknown;
    };
  };
  user?: {
    role?: unknown;
    roles?: unknown;
    permissions?: unknown;
  };
};

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!requiredRoles || requiredRoles.length === 0)
    ) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthzUser }>();
    const user = req.user;

    if (!user) {
      this.logger.warn(
        `[authz] missing req.user for ${req.method} ${req.originalUrl}`,
      );
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (requiredPermissions?.length) {
      const actual = this.extractPermissions(user);
      const allowed = requiredPermissions.some((permission) =>
        actual.includes(permission.toLowerCase()),
      );
      if (!allowed) {
        this.logger.warn(
          `[authz] forbidden ${req.method} ${req.originalUrl} requiredPerms=${requiredPermissions.join(',')} actual=${actual.join(',') || 'none'}`,
        );
        throw new ForbiddenException('Insufficient permissions');
      }
      return true;
    }

    const normalizedRequiredRoles = requiredRoles.map((role) =>
      role.toLowerCase(),
    );
    const actualRoles = this.extractRoles(user);
    const allowed = normalizedRequiredRoles.some((requiredRole) =>
      actualRoles.includes(requiredRole),
    );

    if (!allowed) {
      this.logger.warn(
        `[authz] forbidden ${req.method} ${req.originalUrl} requiredRoles=${normalizedRequiredRoles.join(',')} actual=${actualRoles.join(',') || 'none'}`,
      );
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }

  private extractPermissions(user: AuthzUser): string[] {
    return this.normalizeCandidates([
      user.permissions,
      user.user?.permissions,
      user.data?.permissions,
      user.data?.user?.permissions,
    ]);
  }

  /**
   * QUIZ app roles (`roles`) win when present. Platform `role` is fallback
   * only when no app roles were attached (legacy /me without RBAC).
   */
  private extractRoles(user: AuthzUser): string[] {
    const appRoles = this.normalizeCandidates([
      user.roles,
      user.user?.roles,
      user.data?.roles,
      user.data?.user?.roles,
    ]);

    if (appRoles.length > 0) {
      return appRoles;
    }

    return this.normalizeCandidates([
      user.role,
      user.user?.role,
      user.data?.role,
      user.data?.user?.role,
    ]);
  }

  private normalizeCandidates(candidates: unknown[]): string[] {
    const normalized: string[] = [];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        normalized.push(candidate.toLowerCase());
      }

      if (Array.isArray(candidate)) {
        for (const value of candidate) {
          if (typeof value === 'string' && value.trim()) {
            normalized.push(value.toLowerCase());
          }
        }
      }
    }

    return [...new Set(normalized)];
  }
}
