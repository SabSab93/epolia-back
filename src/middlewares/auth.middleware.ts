import { UserRole } from '@prisma/client';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';

export type AuthUser = {
  id: string;
  email: string | null;
  roles: UserRole[];
};

type JwtPayload = {
  sub?: string;
  email?: string | null;
  roles?: UserRole[];
};

export const requireAuth: RequestHandler = (request, response, next) => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }

  try {
    const token = authorization.replace('Bearer ', '');
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    if (
      !payload.sub ||
      !Array.isArray(payload.roles) ||
      payload.roles.some((role) => !Object.values(UserRole).includes(role))
    ) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    response.locals.authUser = {
      id: payload.sub,
      email: payload.email ?? null,
      roles: payload.roles,
    } satisfies AuthUser;

    next();
  } catch {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
  }
};

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (_request, response, next) => {
    const authUser = response.locals.authUser as AuthUser | undefined;

    if (!authUser) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    if (!authUser.roles.some((role) => allowedRoles.includes(role))) {
      next(new AppError(403, 'FORBIDDEN', 'Forbidden'));
      return;
    }

    next();
  };
}
