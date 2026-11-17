import {
  AccountStatus,
  AuthProvider,
  Prisma,
  PrivacyRequestType,
  ProfileStatus,
  UserRole,
} from '@prisma/client';
import { type Response, Router } from 'express';
import { AppError } from '@/errors/app-error';
import {
  type AuthUser,
  requireAuthAllowUnverified,
} from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';
import { assertAdult, parseAdultBirthDate } from '@/services/age';
import { emailRegex } from '@/services/email';
import {
  assertMaxLength,
  assertPhone,
  maxLength,
} from '@/services/input-limits';
import { hashPassword, minPasswordLength } from '@/services/password';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
usersRouter.use(requireAuthAllowUnverified);
usersRouter.use((_request, response, next) => {
  const authUser = response.locals.authUser as AuthUser;

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

type AdminAction =
  | 'USER_CREATED'
  | 'ROLE_ADDED'
  | 'ROLE_REMOVED'
  | 'STATUS_CHANGED'
  | 'DELETION_REQUESTED'
  | 'USER_ANONYMIZED'
  | 'USER_VIEWED';

function actingAdminId(response: Response): string {
  return (response.locals.authUser as AuthUser).id;
}

// One line per admin action. A change is logged in the same transaction as
// the change itself. A read is logged before the data is sent, with how the
// account was found (never the e-mail itself).
async function logAdminAction(
  db: Prisma.TransactionClient,
  adminId: string,
  action: AdminAction,
  targetId: string,
  details?: Prisma.InputJsonValue,
): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      adminUserId: adminId,
      action,
      targetType: 'USER',
      targetId,
      details,
    },
  });
}

// Refuses to leave the platform without an active admin. The ADMIN role
// rows are locked so that two admins cannot remove each other at once.
async function assertAnotherActiveAdmin(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT user_id FROM user_roles WHERE role = 'ADMIN' FOR UPDATE`;
  const otherAdmins = await tx.userRoleAssignment.count({
    where: {
      role: UserRole.ADMIN,
      userId: { not: userId },
      user: { status: AccountStatus.ACTIVE },
    },
  });

  if (otherAdmins === 0) {
    throw new AppError(
      409,
      'LAST_ADMIN',
      'At least one active admin is required',
    );
  }
}

function isAdmin(user: { roles: { role: UserRole }[] }): boolean {
  return user.roles.some(({ role }) => role === UserRole.ADMIN);
}

// An anonymized account stays anonymized: no reactivation, no new request.
function assertNotAnonymized(user: { anonymizedAt: Date | null }): void {
  if (user.anonymizedAt) {
    throw new AppError(409, 'ACCOUNT_ANONYMIZED', 'Account is anonymized');
  }
}

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
    actingAdminId(response),
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
      actingAdminId(response),
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
    actingAdminId(response),
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
  const { email, password, phone, roles } = body;

  if (
    typeof email !== 'string' ||
    !emailRegex.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < minPasswordLength
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'email and password with at least 8 characters are required',
    );
  }

  assertMaxLength(email.trim(), 'email', maxLength.email);
  assertMaxLength(password, 'password', maxLength.password);

  if (phone !== undefined && typeof phone !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'phone must be a string');
  }
  if (typeof phone === 'string' && phone.trim()) {
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
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: email.trim().toLowerCase(),
          passwordHash,
          birthDate,
          phone: phone ? phone.trim() : undefined,
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
        actingAdminId(response),
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
      // email and phone are both unique: say which one is taken.
      if (JSON.stringify(error.meta?.target ?? '').includes('phone')) {
        throw new AppError(409, 'PHONE_ALREADY_USED', 'Phone already used');
      }
      throw new AppError(409, 'EMAIL_ALREADY_USED', 'Email already used');
    }

    throw error;
  }
});

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      birthDate: true,
      anonymizedAt: true,
      deletionRequestedAt: true,
      roles: { select: { role: true } },
    },
  });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  return user;
}

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
  const assignment = await prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, request.params.userId);
    if (user.status !== AccountStatus.ACTIVE)
      throw new AppError(403, 'ACCOUNT_NOT_ACTIVE', 'Account is not active');
    // An admin account is admin only: ADMIN never shares an account with
    // a student or customer role, in either direction.
    const otherRoles = user.roles.filter(({ role }) => role !== roleValue);
    if (
      otherRoles.length > 0 &&
      (roleValue === UserRole.ADMIN || isAdmin(user))
    ) {
      throw new AppError(
        409,
        'ADMIN_ROLE_EXCLUSIVE',
        'An admin account cannot have another role',
      );
    }
    if (roleValue !== UserRole.ADMIN) {
      assertAdult(user.birthDate);
    }
    const assignment = await tx.userRoleAssignment.upsert({
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
    // Logged only when the role is new, so the log shows real changes.
    if (!user.roles.some(({ role }) => role === roleValue)) {
      await logAdminAction(
        tx,
        actingAdminId(response),
        'ROLE_ADDED',
        request.params.userId,
        {
          role: roleValue,
        },
      );
    }
    return assignment;
  });
  response.status(200).json(assignment);
});

usersRouter.delete('/users/:userId/roles/:role', async (request, response) => {
  const { userId, role } = request.params;

  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role is invalid');
  }

  await prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, userId);
    if (role === UserRole.ADMIN && isAdmin(target)) {
      await assertAnotherActiveAdmin(tx, userId);
    }
    const removed = await tx.userRoleAssignment.deleteMany({
      where: {
        userId,
        role: role as UserRole,
      },
    });
    if (removed.count > 0) {
      await logAdminAction(
        tx,
        actingAdminId(response),
        'ROLE_REMOVED',
        userId,
        { role },
      );
    }
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

  const user = await prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, request.params.userId);
    assertNotAnonymized(target);
    if (status === AccountStatus.ACTIVE && !isAdmin(target)) {
      assertAdult(target.birthDate);
    }
    if (status !== AccountStatus.ACTIVE && isAdmin(target)) {
      await assertAnotherActiveAdmin(tx, request.params.userId);
    }
    const updated = await tx.user.update({
      where: { id: request.params.userId },
      data: { status: status as AccountStatus },
      select: userSelect,
    });
    // Logged only when the status really changes.
    if (target.status !== status) {
      await logAdminAction(
        tx,
        actingAdminId(response),
        'STATUS_CHANGED',
        request.params.userId,
        { from: target.status, to: status },
      );
    }
    return updated;
  });

  response.status(200).json(user);
});

usersRouter.post(
  '/users/:userId/deletion-request',
  async (request, response) => {
    const user = await prisma.$transaction(async (tx) => {
      const target = await lockUser(tx, request.params.userId);
      assertNotAnonymized(target);
      // One request per account: a retry must not replace the first date,
      // which starts the legal deadline to answer.
      if (target.deletionRequestedAt) {
        throw new AppError(
          409,
          'DELETION_ALREADY_REQUESTED',
          'A deletion request already exists for this account',
        );
      }
      await tx.privacyRequest.create({
        data: {
          userId: request.params.userId,
          type: PrivacyRequestType.DELETION,
        },
      });

      const updated = await tx.user.update({
        where: { id: request.params.userId },
        data: {
          deletionRequestedAt: new Date(),
        },
        select: userSelect,
      });
      await logAdminAction(
        tx,
        actingAdminId(response),
        'DELETION_REQUESTED',
        request.params.userId,
      );
      return updated;
    });

    response.status(200).json(user);
  },
);

usersRouter.post('/users/:userId/anonymize', async (request, response) => {
  const { userId } = request.params;
  const anonymizedAt = new Date();

  const user = await prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, userId);
    assertNotAnonymized(target);
    if (isAdmin(target)) {
      await assertAnotherActiveAdmin(tx, userId);
    }
    await tx.authAccount.deleteMany({
      where: { userId },
    });
    await tx.emailVerificationCode.deleteMany({
      where: { userId },
    });

    // Personal data shown on the profiles.
    await tx.userProfile.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.favorite.deleteMany({
      where: { OR: [{ customerUserId: userId }, { studentId: userId }] },
    });
    await tx.studentEducation.deleteMany({ where: { studentId: userId } });
    await tx.studentSpecialty.deleteMany({ where: { studentId: userId } });
    await tx.studentHobby.deleteMany({ where: { studentId: userId } });
    await tx.studentPortfolioItem.deleteMany({ where: { studentId: userId } });
    await tx.studentAvailability.deleteMany({ where: { studentId: userId } });
    await tx.studentVerification.deleteMany({ where: { studentId: userId } });
    // The student profile row stays: missions and DAC7 lines point to it.
    // Kept on purpose: consents (proof of acceptance) and, pending a decision
    // on legal retention for DAC7, the tax profile.
    // Back to DRAFT so that no listing filtering on VISIBLE shows it.
    await tx.studentProfile.updateMany({
      where: { userId },
      data: { title: null, description: null, status: ProfileStatus.DRAFT },
    });

    const anonymized = await tx.user.update({
      where: { id: userId },
      data: {
        email: null,
        emailVerifiedAt: null,
        phone: null,
        passwordHash: null,
        birthDate: null,
        status: AccountStatus.DELETED,
        deletedAt: anonymizedAt,
        anonymizedAt,
      },
      select: userSelect,
    });
    await logAdminAction(
      tx,
      actingAdminId(response),
      'USER_ANONYMIZED',
      userId,
    );
    return anonymized;
  });

  response.status(200).json(user);
});
