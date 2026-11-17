import { AccountStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';
import { sendEmail } from '@/services/email';
import {
  sendVerificationEmail,
  verifyEmailCode,
} from '@/services/email-verification';

jest.mock('@/prisma/client', () => {
  const { PrismaClient } =
    jest.requireActual<typeof import('@prisma/client')>('@prisma/client');
  const { PrismaPg } =
    jest.requireActual<typeof import('@prisma/adapter-pg')>(
      '@prisma/adapter-pg',
    );
  return {
    prisma: new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.CATALOG_TEST_DATABASE_URL,
      }),
    }),
  };
});
jest.mock('@/services/email', () => ({ sendEmail: jest.fn() }));

const sendEmailMock = sendEmail as jest.Mock;
const databaseTests = process.env.CATALOG_TEST_DATABASE_URL
  ? describe
  : describe.skip;

type TestUser = { id: string; email: string };

function lastSentCode() {
  const { text } = sendEmailMock.mock.lastCall[0] as { text: string };
  return /: (\d{6})/.exec(text)?.[1] ?? '';
}

function wrongCode(code: string) {
  return String((Number(code) + 1) % 1_000_000).padStart(6, '0');
}

// 'VERIFIED' on success, otherwise the error code returned to the app.
async function outcome(user: TestUser, code: string) {
  try {
    await verifyEmailCode(user, code);
    return 'VERIFIED';
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

// Skip the one-minute cooldown between two e-mails.
async function skipCooldown(userId: string) {
  await prisma.emailVerificationCode.updateMany({
    where: { userId },
    data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
  });
}

async function emailVerifiedAt(userId: string) {
  const { emailVerifiedAt } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  });
  return emailVerifiedAt;
}

databaseTests('Email verification with PostgreSQL', () => {
  const userIds: string[] = [];

  async function createUser(): Promise<TestUser> {
    const email = `verify-${randomUUID()}@example.com`;
    const { id } = await prisma.user.create({
      data: { email, status: AccountStatus.ACTIVE },
      select: { id: true },
    });
    userIds.push(id);
    return { id, email };
  }

  beforeEach(() => sendEmailMock.mockResolvedValue(undefined));

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('never stores the code itself', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const code = lastSentCode();

    const stored = await prisma.emailVerificationCode.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(Object.values(stored).map(String)).not.toContain(code);
    expect(stored.codeHash).not.toContain(code);
  });

  it('never checks more than 5 values, even with 20 simultaneous requests', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const code = lastSentCode();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => outcome(user, wrongCode(code))),
    );

    expect(
      results.every(
        (result) =>
          result === 'EMAIL_VERIFICATION_CODE_INVALID' ||
          result === 'EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS',
      ),
    ).toBe(true);
    const stored = await prisma.emailVerificationCode.findFirstOrThrow({
      where: { userId: user.id },
      select: { attempts: true },
    });
    expect(stored.attempts).toBe(5);
    // The right code no longer works: a new one must be requested.
    expect(await outcome(user, code)).toBe(
      'EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS',
    );
    expect(await emailVerifiedAt(user.id)).toBeNull();
  });

  it('counts down the attempts and accepts the right code on the fifth try', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const code = lastSentCode();

    const remaining: unknown[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await verifyEmailCode(user, wrongCode(code));
      } catch (error) {
        remaining.push((error as AppError).details?.attemptsRemaining);
      }
    }

    expect(remaining).toEqual([4, 3, 2, 1]);
    expect(await outcome(user, code)).toBe('VERIFIED');
    expect(await emailVerifiedAt(user.id)).toBeInstanceOf(Date);
  });

  it('asks for a new code at the fifth wrong attempt', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const wrong = wrongCode(lastSentCode());

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await outcome(user, wrong);
    }

    expect(await outcome(user, wrong)).toBe(
      'EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS',
    );
  });

  it('confirms the address once when the right code is sent twice at the same time', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const code = lastSentCode();

    const results = await Promise.all([
      outcome(user, code),
      outcome(user, code),
    ]);

    expect(results).toContain('VERIFIED');
    expect(await emailVerifiedAt(user.id)).toBeInstanceOf(Date);
    const used = await prisma.emailVerificationCode.findFirstOrThrow({
      where: { userId: user.id },
      select: { usedAt: true },
    });
    expect(used.usedAt).toBeInstanceOf(Date);
  });

  it('refuses a code older than 10 minutes', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    await prisma.emailVerificationCode.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await outcome(user, lastSentCode())).toBe(
      'EMAIL_VERIFICATION_CODE_EXPIRED',
    );
  });

  it('invalidates the previous code when a new one is sent', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const oldCode = lastSentCode();
    await skipCooldown(user.id);
    await sendVerificationEmail(user);
    const newCode = lastSentCode();

    // Two random codes can be equal: only test the old one when they differ.
    if (oldCode !== newCode) {
      expect(await outcome(user, oldCode)).toBe(
        'EMAIL_VERIFICATION_CODE_INVALID',
      );
    }
    expect(await outcome(user, newCode)).toBe('VERIFIED');
  });

  it('keeps the previous code working while the new e-mail is being sent', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const previousCode = lastSentCode();
    await skipCooldown(user.id);
    let duringSend = '';
    sendEmailMock.mockImplementationOnce(async () => {
      duringSend = await outcome(user, previousCode);
    });

    await sendVerificationEmail(user);

    expect(duringSend).toBe('VERIFIED');
  });

  it('stops sending codes after 20 wrong attempts on the account', async () => {
    const user = await createUser();
    for (let sent = 0; sent < 4; sent += 1) {
      await sendVerificationEmail(user);
      const wrong = wrongCode(lastSentCode());
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await outcome(user, wrong);
      }
      await skipCooldown(user.id);
    }

    await expect(sendVerificationEmail(user)).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_LOCKED',
    });
  });

  it('keeps the previous code working when a resend fails', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const firstCode = lastSentCode();
    await skipCooldown(user.id);
    sendEmailMock.mockRejectedValueOnce(new Error('Resend down'));

    await expect(sendVerificationEmail(user)).rejects.toThrow('Resend down');
    expect(await outcome(user, firstCode)).toBe('VERIFIED');
  });

  it('sends only one e-mail when two resends arrive at the same time', async () => {
    const user = await createUser();
    sendEmailMock.mockClear();

    const results = await Promise.allSettled([
      sendVerificationEmail(user),
      sendVerificationEmail(user),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(
      await prisma.emailVerificationCode.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it('does not let one account use the code sent to another', async () => {
    const owner = await createUser();
    const other = await createUser();
    await sendVerificationEmail(owner);
    const ownerCode = lastSentCode();
    await sendVerificationEmail(other);
    const otherCode = lastSentCode();

    if (ownerCode !== otherCode) {
      expect(await outcome(other, ownerCode)).toBe(
        'EMAIL_VERIFICATION_CODE_INVALID',
      );
    }
    expect(await emailVerifiedAt(other.id)).toBeNull();
  });

  it('does not confirm a new address with a code sent to the old one', async () => {
    const user = await createUser();
    await sendVerificationEmail(user);
    const code = lastSentCode();
    const newEmail = `changed-${randomUUID()}@example.com`;
    await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail },
    });

    expect(await outcome({ id: user.id, email: newEmail }, code)).toBe(
      'EMAIL_VERIFICATION_CODE_EXPIRED',
    );
    expect(await emailVerifiedAt(user.id)).toBeNull();
  });
});
