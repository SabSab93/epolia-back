import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';
import { assertAdult } from '@/services/age';

export async function activateUserRole(
  userId: string,
  role: typeof UserRole.STUDENT | typeof UserRole.CUSTOMER,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const current = await tx.user.findUnique({
            where: { id: userId },
            select: {
              status: true,
              birthDate: true,
              roles: { select: { role: true } },
            },
          });
          if (!current) {
            throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
          }
          if (current.status !== AccountStatus.ACTIVE) {
            throw new AppError(
              403,
              'ACCOUNT_NOT_ACTIVE',
              'Account is not active',
            );
          }
          if (!current.roles.some(({ role }) => role === UserRole.ADMIN)) {
            assertAdult(current.birthDate);
          }
          await tx.userRoleAssignment.createMany({
            data: { userId, role },
            skipDuplicates: true,
          });
          return tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              status: true,
              roles: { select: { role: true } },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const isTransactionConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034';

      if (!isTransactionConflict) {
        throw error;
      }
    }
  }

  throw new AppError(
    409,
    'ROLE_ACTIVATION_CONFLICT',
    'Please retry role activation',
  );
}
