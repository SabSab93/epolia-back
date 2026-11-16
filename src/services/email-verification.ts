import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';
import { sendEmail } from '@/services/email';

const oneDayMs = 24 * 60 * 60 * 1000;
const codeLifetimeMinutes = 10;
const codeLifetimeMs = codeLifetimeMinutes * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxEmailsPerDay = 5;
export const maxCodeAttempts = 5;
// Over the whole life of the account, not per day: guessing a code by trying
// a few values every day would otherwise succeed in the long run.
export const maxFailedAttemptsPerAccount = 20;
export const verificationCodeFormat = /^\d{6}$/;

// Key derived from JWT_SECRET for this use only: no extra variable to set.
// With a keyed hash, a leaked database is not enough to find the codes by
// trying the million possible values.
const codeHashKey = createHmac('sha256', config.jwtSecret)
  .update('email-verification-code')
  .digest();

// The user id is part of the hash: the same code for two accounts gives two hashes.
function hashCode(userId: string, code: string) {
  return createHmac('sha256', codeHashKey)
    .update(`${userId}:${code}`)
    .digest('hex');
}

// Constant-time comparison: the response time does not reveal close guesses.
function sameHash(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

const rateLimitedError = () =>
  new AppError(
    429,
    'EMAIL_VERIFICATION_RATE_LIMITED',
    'Too many confirmation e-mails requested, try again later',
  );

const lockedError = () =>
  new AppError(
    403,
    'EMAIL_VERIFICATION_LOCKED',
    'Too many wrong confirmation codes on this account, contact support',
  );

const expiredError = () =>
  new AppError(
    410,
    'EMAIL_VERIFICATION_CODE_EXPIRED',
    'The confirmation code has expired, request a new one',
  );

// 410 like an expired code: this code is gone, a new one can be requested at once.
const tooManyAttemptsError = () =>
  new AppError(
    410,
    'EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS',
    'Too many attempts with this code, request a new one',
  );

/**
 * Checks the limits and stores the new code in one serializable transaction:
 * two simultaneous requests cannot both pass them. The code is stored
 * inactive (already expired) until its e-mail is accepted.
 */
async function createCodeWithinLimits(
  user: { id: string; email: string },
  codeHash: string,
  now: Date,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const failed = await tx.emailVerificationCode.aggregate({
          where: { userId: user.id },
          _sum: { attempts: true },
        });
        if ((failed._sum.attempts ?? 0) >= maxFailedAttemptsPerAccount) {
          throw lockedError();
        }

        const recentCodes = await tx.emailVerificationCode.findMany({
          where: {
            userId: user.id,
            createdAt: { gt: new Date(now.getTime() - oneDayMs) },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        const lastSentAt = recentCodes[0]?.createdAt;
        if (
          recentCodes.length >= maxEmailsPerDay ||
          (lastSentAt &&
            now.getTime() - lastSentAt.getTime() < resendCooldownMs)
        ) {
          throw rateLimitedError();
        }

        return tx.emailVerificationCode.create({
          data: {
            userId: user.id,
            email: user.email,
            codeHash,
            expiresAt: now,
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // Another request created a code at the same moment: the cooldown applies.
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
 * Creates a new 6-digit code and hands the e-mail to the sending service.
 * The new code becomes valid, and the previous ones stop working, only once
 * the e-mail is accepted: while it is being sent, or if sending fails, the
 * previous code keeps working.
 */
export async function sendVerificationEmail(user: {
  id: string;
  email: string;
}): Promise<void> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const created = await createCodeWithinLimits(
    user,
    hashCode(user.id, code),
    new Date(),
  );

  try {
    // The code stays out of the subject: phones show it on the lock screen.
    await sendEmail({
      to: user.email,
      subject: 'Votre code de confirmation Epolia',
      text: `Bonjour,\n\nVoici votre code pour confirmer votre adresse e-mail : ${code}\n\nIl est valable ${codeLifetimeMinutes} minutes. Ne le communiquez à personne : Epolia ne vous le demandera jamais.\n\nSi vous n'avez pas créé de compte Epolia, ignorez ce message.`,
      html: `<p>Bonjour,</p><p>Voici votre code pour confirmer votre adresse e-mail&nbsp;:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Il est valable ${codeLifetimeMinutes}&nbsp;minutes. Ne le communiquez à personne&nbsp;: Epolia ne vous le demandera jamais.</p><p>Si vous n'avez pas créé de compte Epolia, ignorez ce message.</p>`,
    });
  } catch (error) {
    // A code that was never sent must not count against the resend limit.
    // A cleanup failure must not hide the sending error.
    await prisma.emailVerificationCode
      .delete({ where: { id: created.id } })
      .catch(() => undefined);
    throw error;
  }

  const sentAt = new Date();
  await prisma.$transaction([
    prisma.emailVerificationCode.updateMany({
      where: {
        userId: user.id,
        id: { not: created.id },
        usedAt: null,
        expiresAt: { gt: sentAt },
      },
      data: { expiresAt: sentAt },
    }),
    prisma.emailVerificationCode.update({
      where: { id: created.id },
      data: { expiresAt: new Date(sentAt.getTime() + codeLifetimeMs) },
    }),
  ]);
}

/**
 * Counts one attempt with a conditional update, before any comparison:
 * parallel requests can never check more than `maxCodeAttempts` values.
 * Returns the new attempt count, or null when another request used up,
 * consumed or replaced the code in the meantime.
 */
async function countAttempt(codeId: string) {
  try {
    return await prisma.emailVerificationCode.update({
      where: {
        id: codeId,
        usedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: maxCodeAttempts },
      },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Confirms the address of the signed-in user with the valid code sent to it.
 * Throws an AppError when the code is malformed, wrong, expired or used up.
 */
export async function verifyEmailCode(
  user: { id: string; email: string },
  code: unknown,
): Promise<void> {
  // A malformed value is not a guess: it does not count as an attempt.
  if (typeof code !== 'string' || !verificationCodeFormat.test(code)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'code must contain exactly 6 digits',
    );
  }

  // At most one code is valid at a time. A code sent to a previous address
  // never confirms the current one.
  const record = await prisma.emailVerificationCode.findFirst({
    where: {
      userId: user.id,
      email: user.email,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, codeHash: true, attempts: true },
  });
  if (!record) {
    throw expiredError();
  }
  if (record.attempts >= maxCodeAttempts) {
    throw tooManyAttemptsError();
  }

  const counted = await countAttempt(record.id);
  if (!counted) {
    throw tooManyAttemptsError();
  }

  if (!sameHash(record.codeHash, hashCode(user.id, code))) {
    const attemptsRemaining = maxCodeAttempts - counted.attempts;
    // The last wrong attempt says at once that a new code is needed.
    if (attemptsRemaining <= 0) {
      throw tooManyAttemptsError();
    }
    throw new AppError(
      400,
      'EMAIL_VERIFICATION_CODE_INVALID',
      'The confirmation code is incorrect',
      { attemptsRemaining },
    );
  }

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    // Only one request can consume the code, and only while it is still valid:
    // a code replaced by a newer e-mail in the meantime no longer works.
    const consumed = await tx.emailVerificationCode.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count === 0) {
      throw expiredError();
    }
    // The address may have changed since the code was sent: nothing is
    // confirmed then, and the code stays unused (the error rolls back).
    const verified = await tx.user.updateMany({
      where: { id: user.id, email: user.email, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
    if (verified.count === 0) {
      throw expiredError();
    }
  });
}
