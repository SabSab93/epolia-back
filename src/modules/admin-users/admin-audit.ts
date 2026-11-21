import type { Prisma } from '@prisma/client';

type AdminAction =
  | 'USER_CREATED'
  | 'ROLE_ADDED'
  | 'ROLE_REMOVED'
  | 'STATUS_CHANGED'
  | 'DELETION_REQUESTED'
  | 'USER_ANONYMIZED'
  | 'USER_VIEWED';

// One line per admin action. A change is logged in the same transaction as
// the change itself. A read is logged before the data is sent, with how the
// account was found (never the e-mail itself).
export async function logAdminAction(
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
