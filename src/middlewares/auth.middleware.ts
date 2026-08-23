import { AccountStatus, UserRole } from '@prisma/client';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';

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

export const requireAuth: RequestHandler = async (request, response, next) => {
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

    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        email: true,
        status: true,
        roles: {
          select: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    if (user.status !== AccountStatus.ACTIVE) {
      next(new AppError(403, 'ACCOUNT_NOT_ACTIVE', 'Account is not active'));
      return;
    }

    response.locals.authUser = {
      id: user.id,
      email: user.email,
      roles: user.roles.map((role) => role.role),
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
