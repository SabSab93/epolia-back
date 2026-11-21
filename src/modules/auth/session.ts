import type { Prisma } from '@prisma/client';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '@/config/env';

export const sessionUserSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  status: true,
  roles: { select: { role: true } },
} satisfies Prisma.UserSelect;

type SessionUser = Prisma.UserGetPayload<{ select: typeof sessionUserSelect }>;

function createToken(user: SessionUser) {
  return jwt.sign(
    {
      sub: user.id,
      roles: user.roles.map((role) => role.role),
    },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
    },
  );
}

function formatUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    status: user.status,
    roles: user.roles.map((role) => role.role),
  };
}

export function createSession(user: SessionUser) {
  return { user: formatUser(user), accessToken: createToken(user) };
}
