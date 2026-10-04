import {
  AccountStatus,
  AuthProvider,
  Prisma,
  PrivacyRequestType,
  UserRole,
} from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';

const userSelect = {
  id: true,
  email: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  deletionRequestedAt: true,
  deletedAt: true,
  anonymizedAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export const usersRouter = Router();

usersRouter.use((request, _response, next) => {
  if (!request.path.startsWith('/users')) {
    next('router');
    return;
  }

  next();
});
usersRouter.use(requireAuth);
usersRouter.use((_request, response, next) => {
  const authUser = response.locals.authUser as AuthUser;

  if (!authUser.roles.includes(UserRole.ADMIN)) {
    next(new AppError(403, 'FORBIDDEN', 'Forbidden'));
    return;
  }

  next();
});

usersRouter.get('/users/by-email', async (request, response) => {
  const email = request.query.email;

  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required');
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim() },
    select: userSelect,
  });

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  response.status(200).json(user);
});

usersRouter.get(
  '/users/auth-accounts/:provider/:providerAccountId',
  async (request, response) => {
    const { provider, providerAccountId } = request.params;

    if (!Object.values(AuthProvider).includes(provider as AuthProvider)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'provider is invalid');
    }

    if (!providerAccountId) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'providerAccountId is required',
      );
    }

    const authAccount = await prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: provider as AuthProvider,
          providerAccountId,
        },
      },
      select: {
        user: {
          select: userSelect,
        },
      },
    });

    if (!authAccount?.user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    response.status(200).json(authAccount.user);
  },
);

usersRouter.get('/users/:userId', async (request, response) => {
  const { userId } = request.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  response.status(200).json(user);
});

usersRouter.post('/users/local', async (request, response) => {
  const body = request.body || {};
  const { email, passwordHash, phone, roles } = body;

  if (
    typeof email !== 'string' ||
    email.trim().length === 0 ||
    typeof passwordHash !== 'string' ||
    passwordHash.trim().length === 0
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'email and passwordHash are required',
    );
  }

  if (phone !== undefined && typeof phone !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'phone must be a string');
  }

  if (
    roles !== undefined &&
    (!Array.isArray(roles) ||
      roles.some((role) => !Object.values(UserRole).includes(role as UserRole)))
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'roles are invalid');
  }

  const userRoles = roles ? [...new Set(roles as UserRole[])] : undefined;
  const user = await prisma.user.create({
    data: {
      email: email.trim(),
      passwordHash: passwordHash.trim(),
      phone: phone ? phone.trim() : undefined,
      roles: userRoles?.length
        ? {
            create: userRoles.map((role) => ({ role })),
          }
        : undefined,
    },
    select: userSelect,
  });

  response.status(201).json(user);
});

usersRouter.post('/users/:userId/roles', async (request, response) => {
  const body = request.body || {};
  const role = body.role;

  if (
    typeof role !== 'string' ||
    !Object.values(UserRole).includes(role as UserRole)
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role is invalid');
  }

  const roleValue = role as UserRole;
  const assignment = await prisma.userRoleAssignment.upsert({
    where: {
      userId_role: {
        userId: request.params.userId,
        role: roleValue,
      },
    },
    update: {},
    create: {
      userId: request.params.userId,
      role: roleValue,
    },
  });

  response.status(200).json(assignment);
});

usersRouter.delete('/users/:userId/roles/:role', async (request, response) => {
  const { userId, role } = request.params;

  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role is invalid');
  }

  await prisma.userRoleAssignment.deleteMany({
    where: {
      userId,
      role: role as UserRole,
    },
  });

  response.status(204).send();
});

usersRouter.patch('/users/:userId/status', async (request, response) => {
  const body = request.body || {};
  const status = body.status;

  if (
    typeof status !== 'string' ||
    !Object.values(AccountStatus).includes(status as AccountStatus)
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status is invalid');
  }

  const user = await prisma.user.update({
    where: { id: request.params.userId },
    data: { status: status as AccountStatus },
    select: userSelect,
  });

  response.status(200).json(user);
});

usersRouter.post(
  '/users/:userId/deletion-request',
  async (request, response) => {
    const user = await prisma.$transaction(async (tx) => {
      await tx.privacyRequest.create({
        data: {
          userId: request.params.userId,
          type: PrivacyRequestType.DELETION,
        },
      });

      return tx.user.update({
        where: { id: request.params.userId },
        data: {
          deletionRequestedAt: new Date(),
        },
        select: userSelect,
      });
    });

    response.status(200).json(user);
  },
);

usersRouter.post('/users/:userId/anonymize', async (request, response) => {
  const { userId } = request.params;
  const anonymizedAt = new Date();

  const user = await prisma.$transaction(async (tx) => {
    await tx.authAccount.deleteMany({
      where: { userId },
    });

    return tx.user.update({
      where: { id: userId },
      data: {
        email: null,
        phone: null,
        passwordHash: null,
        status: AccountStatus.DELETED,
        deletedAt: anonymizedAt,
        anonymizedAt,
      },
      select: userSelect,
    });
  });

  response.status(200).json(user);
});
