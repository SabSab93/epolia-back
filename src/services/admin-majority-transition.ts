import { AccountStatus, PrismaClient, UserRole } from '@prisma/client';
import { AppError } from '@/errors/app-error';
import { isAdult, parseAdultBirthDate } from '@/services/age';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function hasEligibleAdmin(client: PrismaClient) {
  const admins = await client.user.findMany({
    where: {
      status: AccountStatus.ACTIVE,
      roles: { some: { role: UserRole.ADMIN } },
    },
    select: { birthDate: true },
  });
  return admins.some((admin) => isAdult(admin.birthDate));
}

// Operator-only transition, deliberately not exposed through an HTTP endpoint.
// The caller must obtain the real date through an authorized process beforehand.
export async function recordConfirmedAdminBirthDate(
  client: PrismaClient,
  input: unknown,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Expected userId and birthDate',
    );
  }
  const { userId, birthDate: value } = input as Record<string, unknown>;
  if (typeof userId !== 'string' || !uuidRegex.test(userId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'userId must be a UUID');
  }
  const birthDate = parseAdultBirthDate(value);

  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        birthDate: true,
        roles: { select: { role: true } },
      },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (
      user.status !== AccountStatus.ACTIVE ||
      !user.roles.some(({ role }) => role === UserRole.ADMIN)
    ) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'An existing active administrator is required',
      );
    }
    if (user.birthDate) {
      if (user.birthDate.getTime() === birthDate.getTime()) return;
      throw new AppError(
        409,
        'BIRTH_DATE_ALREADY_SET',
        'The recorded birth date cannot be overwritten',
      );
    }
    await tx.user.update({ where: { id: userId }, data: { birthDate } });
  });
}
