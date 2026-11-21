import type { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AppError } from '@/errors/app-error';

export type AuthUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  roles: UserRole[];
};

export function getAuthUser(response: Response): AuthUser {
  const user: AuthUser | undefined = response.locals.authUser;
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return user;
}
