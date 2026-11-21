import { AccountStatus, AuthProvider, Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import {
  userSelect,
  addUserRole,
  removeUserRole,
  changeUserStatus,
  requestUserDeletion,
  anonymizeUser,
} from '@/modules/admin-users/account-management';
import { logAdminAction } from '@/modules/admin-users/admin-audit';
import { parseAdultBirthDate } from '@/modules/auth/age';
import { getAuthUser } from '@/modules/auth/auth-user';
import { requireAuthAllowUnverified } from '@/modules/auth/auth.middleware';
import { readNewCredentials } from '@/modules/auth/new-credentials';
import { hashPassword } from '@/modules/auth/password';
import { prisma } from '@/prisma/client';
import { uuidRegex } from '@/validation/input-formats';
import {
  assertMaxLength,
  assertPhone,
  maxLength,
} from '@/validation/input-limits';

export const usersRouter = Router();

usersRouter.use((request, _response, next) => {
  if (!request.path.startsWith('/users')) {
    next('router');
    return;
  }

  next();
});
usersRouter.use(requireAuthAllowUnverified);
usersRouter.use((_request, response, next) => {
  const authUser = getAuthUser(response);

  if (!authUser.roles.includes(UserRole.ADMIN)) {
    next(new AppError(403, 'FORBIDDEN', 'Forbidden'));
    return;
  }

  next();
});

// Checked before Prisma: an invalid id would otherwise answer 500.
usersRouter.param('userId', (_request, _response, next, userId: string) => {
  if (!uuidRegex.test(userId)) {
    next(new AppError(400, 'VALIDATION_ERROR', 'userId is invalid'));
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
    where: { email: email.trim().toLowerCase() },
    select: userSelect,
  });

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  await logAdminAction(
    prisma,
    getAuthUser(response).id,
    'USER_VIEWED',
    user.id,
    {
      lookup: 'EMAIL',
    },
  );
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

    await logAdminAction(
      prisma,
      getAuthUser(response).id,
      'USER_VIEWED',
      authAccount.user.id,
      {
        lookup: 'AUTH_ACCOUNT',
      },
    );
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

  await logAdminAction(
    prisma,
    getAuthUser(response).id,
    'USER_VIEWED',
    user.id,
    {
      lookup: 'ID',
    },
  );
  response.status(200).json(user);
});

usersRouter.post('/users/local', async (request, response) => {
  const body = request.body || {};
  const { phone, roles } = body;
  const credentials = readNewCredentials(body.email, body.password);

  if (phone !== undefined && typeof phone !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'phone must be a string');
  }
  if (typeof phone === 'string' && phone.trim()) {
    assertMaxLength(phone, 'phone', maxLength.phone);
    assertPhone(phone.trim());
  }

  if (
    roles !== undefined &&
    (!Array.isArray(roles) ||
      roles.some((role) => !Object.values(UserRole).includes(role as UserRole)))
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'roles are invalid');
  }

  const userRoles = roles ? [...new Set(roles as UserRole[])] : undefined;
  // An admin account is admin only: no student or customer role.
  if (userRoles?.includes(UserRole.ADMIN) && userRoles.length > 1) {
    throw new AppError(
      400,
      'ADMIN_ROLE_EXCLUSIVE',
      'ADMIN cannot be combined with another role',
    );
  }
  const birthDate = userRoles?.includes(UserRole.ADMIN)
    ? null
    : parseAdultBirthDate(body.birthDate);
  const passwordHash = await hashPassword(credentials.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: credentials.email,
          passwordHash,
          birthDate,
          // A blank phone is not stored (it would clash on the unique index).
          phone: phone?.trim() || undefined,
          roles: userRoles?.length
            ? {
                create: userRoles.map((role) => ({ role })),
              }
            : undefined,
        },
        select: userSelect,
      });
      await logAdminAction(
        tx,
        getAuthUser(response).id,
        'USER_CREATED',
        created.id,
        {
          roles: userRoles ?? [],
        },
      );
      return created;
    });

    response.status(201).json(user);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // email and phone are both unique: say which one is taken. Prisma 7 puts
      // the constraint name (users_phone_key) under meta.driverAdapterError.
      if (JSON.stringify(error.meta ?? {}).includes('phone')) {
        throw new AppError(409, 'PHONE_ALREADY_USED', 'Phone already used');
      }
      throw new AppError(409, 'EMAIL_ALREADY_USED', 'Email already used');
    }

    throw error;
  }
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
  const assignment = await addUserRole(
    getAuthUser(response).id,
    request.params.userId,
    roleValue,
  );
  response.status(200).json(assignment);
});

usersRouter.delete('/users/:userId/roles/:role', async (request, response) => {
  const { userId, role } = request.params;

  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role is invalid');
  }

  await removeUserRole(getAuthUser(response).id, userId, role as UserRole);

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

  const user = await changeUserStatus(
    getAuthUser(response).id,
    request.params.userId,
    status as AccountStatus,
  );

  response.status(200).json(user);
});

usersRouter.post(
  '/users/:userId/deletion-request',
  async (request, response) => {
    const user = await requestUserDeletion(
      getAuthUser(response).id,
      request.params.userId,
    );

    response.status(200).json(user);
  },
);

usersRouter.post('/users/:userId/anonymize', async (request, response) => {
  const { userId } = request.params;

  const user = await anonymizeUser(getAuthUser(response).id, userId);

  response.status(200).json(user);
});
