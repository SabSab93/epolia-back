import {
  AccountStatus,
  Prisma,
  PrivacyRequestType,
  ProfileStatus,
  UserRole,
} from '@prisma/client';
import { AppError } from '@/errors/app-error';
import { logAdminAction } from '@/modules/admin-users/admin-audit';
import { assertAdult } from '@/modules/auth/age';
import { prisma } from '@/prisma/client';

export const userSelect = {
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

export async function addUserRole(
  adminId: string,
  userId: string,
  roleValue: UserRole,
) {
  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
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
          userId,
          role: roleValue,
        },
      },
      update: {},
      create: {
        userId,
        role: roleValue,
      },
    });
    // Logged only when the role is new, so the log shows real changes.
    if (!user.roles.some(({ role }) => role === roleValue)) {
      await logAdminAction(tx, adminId, 'ROLE_ADDED', userId, {
        role: roleValue,
      });
    }
    return assignment;
  });
}

export async function removeUserRole(
  adminId: string,
  userId: string,
  role: UserRole,
) {
  await prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, userId);
    if (role === UserRole.ADMIN && isAdmin(target)) {
      await assertAnotherActiveAdmin(tx, userId);
    }
    const removed = await tx.userRoleAssignment.deleteMany({
      where: {
        userId,
        role,
      },
    });
    if (removed.count > 0) {
      await logAdminAction(tx, adminId, 'ROLE_REMOVED', userId, { role });
    }
  });
}

export async function changeUserStatus(
  adminId: string,
  userId: string,
  status: AccountStatus,
) {
  return prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, userId);
    assertNotAnonymized(target);
    if (status === AccountStatus.ACTIVE && !isAdmin(target)) {
      assertAdult(target.birthDate);
    }
    if (status !== AccountStatus.ACTIVE && isAdmin(target)) {
      await assertAnotherActiveAdmin(tx, userId);
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { status },
      select: userSelect,
    });
    // Logged only when the status really changes.
    if (target.status !== status) {
      await logAdminAction(tx, adminId, 'STATUS_CHANGED', userId, {
        from: target.status,
        to: status,
      });
    }
    return updated;
  });
}

export async function requestUserDeletion(adminId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const target = await lockUser(tx, userId);
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
        userId,
        type: PrivacyRequestType.DELETION,
      },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: new Date(),
      },
      select: userSelect,
    });
    await logAdminAction(tx, adminId, 'DELETION_REQUESTED', userId);
    return updated;
  });
}

export async function anonymizeUser(adminId: string, userId: string) {
  const anonymizedAt = new Date();
  return prisma.$transaction(async (tx) => {
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
    await logAdminAction(tx, adminId, 'USER_ANONYMIZED', userId);
    return anonymized;
  });
}
