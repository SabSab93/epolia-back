import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';
import { sendEmail } from '@/services/email';

const oneDayMs = 24 * 60 * 60 * 1000;
const tokenLifetimeMs = oneDayMs;
const resendCooldownMs = 60 * 1000;
const maxEmailsPerDay = 5;
export const verificationTokenFormat = /^[A-Za-z0-9_-]{43}$/;

export type EmailVerificationResult =
  | 'VERIFIED'
  | 'INVALID'
  | 'EXPIRED'
  | 'ALREADY_USED';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

const rateLimitedError = () =>
  new AppError(
    429,
    'EMAIL_VERIFICATION_RATE_LIMITED',
    'Too many confirmation e-mails requested, try again later',
  );

/**
 * Checks the resend limits and stores the new link in one serializable
 * transaction: two simultaneous requests cannot both pass the limit.
 */
async function createTokenWithinLimits(
  user: { id: string; email: string },
  tokenHash: string,
  now: Date,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const recentTokens = await tx.emailVerificationToken.findMany({
          where: {
            userId: user.id,
            createdAt: { gt: new Date(now.getTime() - oneDayMs) },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        const lastSentAt = recentTokens[0]?.createdAt;
        if (
          recentTokens.length >= maxEmailsPerDay ||
          (lastSentAt &&
            now.getTime() - lastSentAt.getTime() < resendCooldownMs)
        ) {
          throw rateLimitedError();
        }

        return tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            email: user.email,
            tokenHash,
            expiresAt: new Date(now.getTime() + tokenLifetimeMs),
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // Another request created a link at the same moment: the cooldown applies.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      throw rateLimitedError();
    }
    throw error;
  }
}

/**
 * Creates a new one-time link and hands the e-mail to the sending service.
 * The previous links stop working only once the new e-mail is accepted, so a
 * failed resend never leaves the person without a working link.
 */
export async function sendVerificationEmail(user: {
  id: string;
  email: string;
}): Promise<void> {
  const now = new Date();
  const token = randomBytes(32).toString('base64url');
  const created = await createTokenWithinLimits(user, hashToken(token), now);

  const link = `${config.publicApiUrl}/api/auth/verify-email?token=${token}`;
  try {
    await sendEmail({
      to: user.email,
      subject: 'Confirmez votre adresse e-mail Epolia',
      text: `Bonjour,\n\nPour confirmer votre adresse e-mail, ouvrez ce lien (valable 24 heures) :\n${link}\n\nSi vous n'avez pas créé de compte Epolia, ignorez ce message.`,
      html: `<p>Bonjour,</p><p>Pour confirmer votre adresse e-mail, ouvrez ce lien (valable 24&nbsp;heures)&nbsp;:</p><p><a href="${link}">Confirmer mon adresse e-mail</a></p><p>Si vous n'avez pas créé de compte Epolia, ignorez ce message.</p>`,
    });
  } catch (error) {
    // A link that was never sent must not count against the resend limit.
    // A cleanup failure must not hide the sending error.
    await prisma.emailVerificationToken
      .delete({ where: { id: created.id } })
      .catch(() => undefined);
    throw error;
  }

  await prisma.emailVerificationToken.updateMany({
    where: {
      userId: user.id,
      id: { not: created.id },
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt: now },
  });
}

/**
 * Consumes a link once. The conditional update makes two simultaneous clicks
 * safe: only one of them can switch `usedAt` from null to a date.
 */
export async function verifyEmailToken(
  token: unknown,
): Promise<EmailVerificationResult> {
  if (typeof token !== 'string' || !verificationTokenFormat.test(token)) {
    return 'INVALID';
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      email: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { email: true } },
    },
  });

  // A link sent to a previous address never confirms the current one.
  if (!record || record.user.email !== record.email) {
    return 'INVALID';
  }
  if (record.usedAt) {
    return 'ALREADY_USED';
  }

  const now = new Date();
  if (record.expiresAt <= now) {
    return 'EXPIRED';
  }

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count === 0) {
      return 'ALREADY_USED';
    }

    await tx.user.updateMany({
      where: { id: record.userId, email: record.email, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
    return 'VERIFIED';
  });
}
