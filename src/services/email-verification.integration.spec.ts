import { AccountStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/prisma/client';
import { sendEmail } from '@/services/email';
import {
  sendVerificationEmail,
  verifyEmailToken,
} from '@/services/email-verification';

jest.mock('@/prisma/client', () => {
  const { PrismaClient } =
    jest.requireActual<typeof import('@prisma/client')>('@prisma/client');
  return {
    prisma: new PrismaClient({
      datasourceUrl: process.env.CATALOG_TEST_DATABASE_URL,
    }),
  };
});
jest.mock('@/services/email', () => ({ sendEmail: jest.fn() }));

const sendEmailMock = sendEmail as jest.Mock;
const databaseTests = process.env.CATALOG_TEST_DATABASE_URL
  ? describe
  : describe.skip;

function lastSentToken() {
  const { text } = sendEmailMock.mock.lastCall[0] as { text: string };
  return /token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? '';
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `verify-${randomUUID()}@example.com`,
      status: AccountStatus.ACTIVE,
    },
    select: { id: true, email: true },
  });
}

databaseTests('Email verification with PostgreSQL', () => {
  const userIds: string[] = [];

  beforeEach(() => sendEmailMock.mockResolvedValue(undefined));

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('confirms the address once when the link is clicked twice at the same time', async () => {
    const user = await createUser();
    userIds.push(user.id);
    await sendVerificationEmail({ id: user.id, email: user.email! });
    const token = lastSentToken();

    const results = await Promise.all([
      verifyEmailToken(token),
      verifyEmailToken(token),
    ]);

    expect(results.sort()).toEqual(['ALREADY_USED', 'VERIFIED']);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerifiedAt: true },
    });
    expect(stored.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await verifyEmailToken(token)).toBe('ALREADY_USED');
  });

  it('invalidates the previous link when a new one is sent', async () => {
    const user = await createUser();
    userIds.push(user.id);
    await sendVerificationEmail({ id: user.id, email: user.email! });
    const oldToken = lastSentToken();
    // Skip the one-minute cooldown between two e-mails.
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    await sendVerificationEmail({ id: user.id, email: user.email! });

    expect(await verifyEmailToken(oldToken)).toBe('EXPIRED');
    expect(await verifyEmailToken(lastSentToken())).toBe('VERIFIED');
  });

  it('sends only one e-mail when two resends arrive at the same time', async () => {
    const user = await createUser();
    userIds.push(user.id);
    sendEmailMock.mockClear();

    const results = await Promise.allSettled([
      sendVerificationEmail({ id: user.id, email: user.email! }),
      sendVerificationEmail({ id: user.id, email: user.email! }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(
      await prisma.emailVerificationToken.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it('keeps the previous link working when a resend fails', async () => {
    const user = await createUser();
    userIds.push(user.id);
    await sendVerificationEmail({ id: user.id, email: user.email! });
    const firstToken = lastSentToken();
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    sendEmailMock.mockRejectedValueOnce(new Error('Resend down'));

    await expect(
      sendVerificationEmail({ id: user.id, email: user.email! }),
    ).rejects.toThrow('Resend down');
    expect(await verifyEmailToken(firstToken)).toBe('VERIFIED');
  });

  it('does not confirm a new address with a link sent to the old one', async () => {
    const user = await createUser();
    userIds.push(user.id);
    await sendVerificationEmail({ id: user.id, email: user.email! });
    await prisma.user.update({
      where: { id: user.id },
      data: { email: `changed-${randomUUID()}@example.com` },
    });

    expect(await verifyEmailToken(lastSentToken())).toBe('INVALID');
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerifiedAt: true },
    });
    expect(stored.emailVerifiedAt).toBeNull();
  });
});
