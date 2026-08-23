import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Router } from 'express';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';

const scrypt = promisify(scryptCallback);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authUserSelect = {
  id: true,
  email: true,
  status: true,
  passwordHash: true,
  roles: {
    select: {
      role: true,
    },
  },
} satisfies Prisma.UserSelect;

export const authRouter = Router();

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(':');

  if (!salt || !storedHash) {
    return false;
  }

  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const storedHashBuffer = Buffer.from(storedHash, 'hex');

  if (hash.length !== storedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(hash, storedHashBuffer);
}

function createToken(user: {
  id: string;
  email: string | null;
  roles: { role: UserRole }[];
}) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles.map((role) => role.role),
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
    },
  );
}

function formatUser(user: {
  id: string;
  email: string | null;
  status: AccountStatus;
  roles: { role: UserRole }[];
}) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    roles: user.roles.map((role) => role.role),
  };
}

authRouter.post('/auth/register', async (request, response) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const { email, password, role } = body;

  if (
    typeof email !== 'string' ||
    !emailRegex.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 8
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'email and password with at least 8 characters are required',
    );
  }

  if (
    role !== undefined &&
    role !== UserRole.ETUDIANT &&
    role !== UserRole.PARTICULIER
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role is invalid');
  }

  const passwordHash = await hashPassword(password);
  const userRole =
    role === UserRole.ETUDIANT ? UserRole.ETUDIANT : UserRole.PARTICULIER;

  try {
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        status: AccountStatus.ACTIVE,
        roles: {
          create: [{ role: userRole }],
        },
      },
      select: authUserSelect,
    });

    response.status(201).json({
      user: formatUser(user),
      accessToken: createToken(user),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError(409, 'EMAIL_ALREADY_USED', 'Email already used');
    }

    throw error;
  }
});

authRouter.post('/auth/login', async (request, response) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const { email, password } = body;

  if (
    typeof email !== 'string' ||
    !emailRegex.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'email and password are required',
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      email: email.trim().toLowerCase(),
    },
    select: authUserSelect,
  });

  if (
    !user?.passwordHash ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (user.status !== AccountStatus.ACTIVE) {
    throw new AppError(403, 'ACCOUNT_NOT_ACTIVE', 'Account is not active');
  }

  response.status(200).json({
    user: formatUser(user),
    accessToken: createToken(user),
  });
});

authRouter.get('/auth/me', requireAuth, (_request, response) => {
  response.status(200).json(response.locals.authUser as AuthUser);
});
