import { AccountStatus, UserRole } from '@prisma/client';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';
import { assertAdult } from '@/services/age';

export type AuthUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  roles: UserRole[];
};

type JwtPayload = {
  sub?: string;
  roles?: UserRole[];
};

/**
 * Default for every signed-in route: the account must have confirmed its
 * e-mail address. New routes are protected without anyone having to think
 * about it.
 */
export const requireAuth: RequestHandler = (request, response, next) =>
  authenticate(request, response, next, { allowUnverifiedEmail: false });

/**
 * Only for setting up an account before the e-mail is confirmed: reading
 * one's own account (/auth/me, accepted terms, own profile), profile, student
 * profile, educations, specialties, roles, e-mail confirmation.
 * Admin routes use it too until the back office is planned.
 */
export const requireAuthAllowUnverified: RequestHandler = (
  request,
  response,
  next,
) => authenticate(request, response, next, { allowUnverifiedEmail: true });

async function authenticate(
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
  { allowUnverifiedEmail }: { allowUnverifiedEmail: boolean },
) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }

  try {
    const token = authorization.replace('Bearer ', '');
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

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
        emailVerifiedAt: true,
        status: true,
        birthDate: true,
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

    if (!user.roles.some(({ role }) => role === UserRole.ADMIN)) {
      assertAdult(user.birthDate);
    }

    if (!allowUnverifiedEmail && !user.emailVerifiedAt) {
      next(
        new AppError(
          403,
          'EMAIL_NOT_VERIFIED',
          'Confirm your e-mail address to continue',
        ),
      );
      return;
    }

    response.locals.authUser = {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      roles: user.roles.map((role) => role.role),
    } satisfies AuthUser;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
  }
}
