import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AppError } from '@/errors/app-error';
import { getAuthUser } from '@/modules/auth/auth-user';

export function requireStudent(response: Response) {
  const user = getAuthUser(response);
  if (!user.roles.includes(UserRole.STUDENT)) {
    throw new AppError(403, 'FORBIDDEN', 'Forbidden');
  }
  return user;
}
