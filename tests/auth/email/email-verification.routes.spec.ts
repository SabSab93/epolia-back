import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { emailVerificationRouter } from '@/modules/auth/email/email-verification.routes';
import { sendEmail } from '@/modules/auth/email/email';

jest.mock('@/prisma/client', () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    emailVerificationCode: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/modules/auth/email/email', () => ({ sendEmail: jest.fn() }));

type Mock = jest.Mock;
const prismaMock = prisma as unknown as {
  user: { findUnique: Mock; updateMany: Mock };
  emailVerificationCode: {
    aggregate: Mock;
    findMany: Mock;
    findFirst: Mock;
    create: Mock;
    update: Mock;
    updateMany: Mock;
    delete: Mock;
  };
  $transaction: Mock;
};
const sendEmailMock = sendEmail as Mock;

const userId = '0f2f2c96-8f55-4a42-86ad-b9d9981edb34';
const email = 'user@example.com';

const storedUser = {
  id: userId,
  email,
  emailVerifiedAt: null as Date | null,
  status: AccountStatus.ACTIVE,
  birthDate: new Date('2000-01-01T00:00:00Z'),
  roles: [{ role: UserRole.CUSTOMER }],
};

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', emailVerificationRouter);
  app.use(errorHandler);
  return app;
}

function authorization() {
  const accessToken = jwt.sign(
    { sub: userId, roles: [UserRole.CUSTOMER] },
    config.jwtSecret,
  );
  return `Bearer ${accessToken}`;
}

function resend() {
  return request(createTestApp())
    .post('/api/auth/email-verification')
    .set('Authorization', authorization());
}

function verify(code: unknown) {
  return request(createTestApp())
    .post('/api/auth/email-verification/verify')
    .set('Authorization', authorization())
    .send({ code });
}

function notFound() {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: Prisma.prismaVersion.client,
  });
}

// Sends a real code through the route and returns it with its stored hash.
async function sendCode() {
  await resend();
  const [created] = prismaMock.emailVerificationCode.create.mock.calls[0] as [
    { data: { codeHash: string } },
  ];
  const [sent] = sendEmailMock.mock.calls[0] as [{ text: string }];
  const code = /: (\d{6})/.exec(sent.text)?.[1] ?? '';
  prismaMock.emailVerificationCode.update.mockReset();
  prismaMock.emailVerificationCode.updateMany.mockReset();
  prismaMock.emailVerificationCode.updateMany.mockResolvedValue({ count: 1 });
  return { code, codeHash: created.data.codeHash };
}

function storedCode(overrides: Record<string, unknown> = {}) {
  return { id: 'code-id', codeHash: 'a'.repeat(64), attempts: 0, ...overrides };
}

describe('Email verification routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      (
        arg: ((tx: typeof prismaMock) => Promise<unknown>) | Promise<unknown>[],
      ) => (typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)),
    );
    prismaMock.user.findUnique.mockResolvedValue(storedUser);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.emailVerificationCode.aggregate.mockResolvedValue({
      _sum: { attempts: 0 },
    });
    prismaMock.emailVerificationCode.findMany.mockResolvedValue([]);
    prismaMock.emailVerificationCode.create.mockResolvedValue({
      id: 'new-code-id',
    });
    prismaMock.emailVerificationCode.update.mockResolvedValue({});
    prismaMock.emailVerificationCode.delete.mockResolvedValue({});
    prismaMock.emailVerificationCode.updateMany.mockResolvedValue({ count: 1 });
    sendEmailMock.mockResolvedValue(undefined);
  });

  describe('GET /auth/verify-email (links sent before the switch to codes)', () => {
    it('explains that links are replaced, without reading the token', async () => {
      const response = await request(createTestApp()).get(
        '/api/auth/verify-email?token=<script>alert(1)</script>',
      );

      expect(response.status).toBe(410);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).toContain('Ce lien n’est plus utilisé');
      expect(response.text).not.toContain('<script>');
    });
  });

  describe('POST /auth/email-verification', () => {
    it('requires authentication', async () => {
      const response = await request(createTestApp()).post(
        '/api/auth/email-verification',
      );

      expect(response.status).toBe(401);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('sends a 6-digit code and stores only a keyed hash', async () => {
      const response = await resend();

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ emailVerificationSent: true });

      const [created] = prismaMock.emailVerificationCode.create.mock
        .calls[0] as [{ data: { codeHash: string } }];
      const [sent] = sendEmailMock.mock.calls[0] as [
        { to: string; subject: string; text: string; html: string },
      ];
      const code = /: (\d{6})/.exec(sent.text)?.[1] ?? '';

      expect(sent.to).toBe(email);
      expect(code).toMatch(/^\d{6}$/);
      expect(sent.html).toContain(code);
      // Phones show the subject on the lock screen: the code is not in it.
      expect(sent.subject).not.toContain(code);
      expect(created.data).toMatchObject({ userId, email });
      expect(created.data.codeHash).toMatch(/^[0-9a-f]{64}$/);
      // A plain hash of a 6-digit code could be reversed by trying them all.
      expect(created.data.codeHash).not.toBe(
        createHash('sha256').update(code).digest('hex'),
      );
    });

    it('stores the code inactive, then activates it for 10 minutes once sent', async () => {
      await resend();

      const [created] = prismaMock.emailVerificationCode.create.mock
        .calls[0] as [{ data: { expiresAt: Date } }];
      // Inactive while the e-mail is being sent: the previous code still counts.
      expect(created.data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());

      expect(prismaMock.emailVerificationCode.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          id: { not: 'new-code-id' },
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { expiresAt: expect.any(Date) },
      });
      const [activation] = prismaMock.emailVerificationCode.update.mock
        .calls[0] as [{ where: { id: string }; data: { expiresAt: Date } }];
      expect(activation.where).toEqual({ id: 'new-code-id' });
      const lifetime = activation.data.expiresAt.getTime() - Date.now();
      expect(lifetime).toBeGreaterThan(9 * 60 * 1000);
      expect(lifetime).toBeLessThanOrEqual(10 * 60 * 1000);
    });

    it('refuses an address that is already confirmed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...storedUser,
        emailVerifiedAt: new Date(),
      });

      const response = await resend();

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EMAIL_ALREADY_VERIFIED');
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it.each([
      ['less than a minute after the previous e-mail', [new Date()]],
      [
        'after five e-mails in 24 hours',
        Array.from({ length: 5 }, () => new Date(Date.now() - 2 * 60 * 1000)),
      ],
    ])('limits requests %s', async (_label, dates) => {
      prismaMock.emailVerificationCode.findMany.mockResolvedValue(
        dates.map((createdAt) => ({ createdAt })),
      );

      const response = await resend();

      expect(response.status).toBe(429);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_RATE_LIMITED');
      expect(prismaMock.emailVerificationCode.create).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('stops sending codes after 20 wrong attempts on the account', async () => {
      prismaMock.emailVerificationCode.aggregate.mockResolvedValue({
        _sum: { attempts: 20 },
      });

      const response = await resend();

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_LOCKED');
      expect(prismaMock.emailVerificationCode.create).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('reports a sending failure and keeps the previous code working', async () => {
      sendEmailMock.mockRejectedValue(
        new AppError(502, 'EMAIL_SEND_FAILED', 'E-mail could not be sent'),
      );

      const response = await resend();

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('EMAIL_SEND_FAILED');
      // The unsent code is removed so it does not count against the limit.
      expect(prismaMock.emailVerificationCode.delete).toHaveBeenCalledWith({
        where: { id: 'new-code-id' },
      });
      expect(
        prismaMock.emailVerificationCode.updateMany,
      ).not.toHaveBeenCalled();
      expect(prismaMock.emailVerificationCode.update).not.toHaveBeenCalled();
    });

    it('keeps the sending error when the cleanup also fails', async () => {
      sendEmailMock.mockRejectedValue(
        new AppError(502, 'EMAIL_SEND_FAILED', 'E-mail could not be sent'),
      );
      prismaMock.emailVerificationCode.delete.mockRejectedValue(
        new Error('connection lost'),
      );

      const response = await resend();

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('EMAIL_SEND_FAILED');
    });

    it('treats a simultaneous request as rate limited', async () => {
      prismaMock.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
          code: 'P2034',
          clientVersion: Prisma.prismaVersion.client,
        }),
      );

      const response = await resend();

      expect(response.status).toBe(429);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_RATE_LIMITED');
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/email-verification/verify', () => {
    it('requires authentication', async () => {
      const response = await request(createTestApp())
        .post('/api/auth/email-verification/verify')
        .send({ code: '123456' });

      expect(response.status).toBe(401);
      expect(prismaMock.emailVerificationCode.findFirst).not.toHaveBeenCalled();
    });

    it.each([undefined, '', '12345', '1234567', 'abcdef', '12 345', 123456])(
      'rejects a malformed code without counting an attempt: %j',
      async (code) => {
        const response = await verify(code);

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
        expect(prismaMock.emailVerificationCode.update).not.toHaveBeenCalled();
      },
    );

    it('refuses an address that is already confirmed', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...storedUser,
        emailVerifiedAt: new Date(),
      });

      const response = await verify('123456');

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EMAIL_ALREADY_VERIFIED');
    });

    it('only looks for a valid code sent to the current address', async () => {
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(null);

      const response = await verify('123456');

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_CODE_EXPIRED');
      expect(prismaMock.emailVerificationCode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId,
            email,
            usedAt: null,
            expiresAt: { gt: expect.any(Date) },
          },
        }),
      );
      expect(prismaMock.emailVerificationCode.update).not.toHaveBeenCalled();
    });

    it('counts the attempt before comparing and returns the attempts left', async () => {
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(
        storedCode(),
      );
      prismaMock.emailVerificationCode.update.mockResolvedValue({
        attempts: 1,
      });

      const response = await verify('123456');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        attemptsRemaining: 4,
        status: 400,
        code: 'EMAIL_VERIFICATION_CODE_INVALID',
        message: 'The confirmation code is incorrect',
      });
      expect(prismaMock.emailVerificationCode.update).toHaveBeenCalledWith({
        where: {
          id: 'code-id',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
          attempts: { lt: 5 },
        },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });

    it('asks for a new code at once after the fifth wrong attempt (410, not 429)', async () => {
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(
        storedCode(),
      );
      prismaMock.emailVerificationCode.update.mockResolvedValue({
        attempts: 5,
      });

      const response = await verify('123456');

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS');
      expect(response.body).not.toHaveProperty('attemptsRemaining');
    });

    it('refuses even the right code once the attempts are used up', async () => {
      const { code, codeHash } = await sendCode();
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(
        storedCode({ codeHash, attempts: 5 }),
      );

      const response = await verify(code);

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS');
      expect(prismaMock.emailVerificationCode.update).not.toHaveBeenCalled();
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses the code when a parallel request used up its attempts', async () => {
      const { code, codeHash } = await sendCode();
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(
        storedCode({ codeHash, attempts: 4 }),
      );
      prismaMock.emailVerificationCode.update.mockRejectedValue(notFound());

      const response = await verify(code);

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS');
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });

    it('confirms the address with the right code', async () => {
      const { code, codeHash } = await sendCode();
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(
        storedCode({ codeHash }),
      );
      prismaMock.emailVerificationCode.update.mockResolvedValue({
        attempts: 1,
      });

      const response = await verify(code);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ emailVerified: true });
      expect(prismaMock.emailVerificationCode.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'code-id',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { usedAt: expect.any(Date) },
      });
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: userId, email, emailVerifiedAt: null },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it('does not confirm when the code was replaced by a newer e-mail meanwhile', async () => {
      const { code, codeHash } = await sendCode();
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(
        storedCode({ codeHash }),
      );
      prismaMock.emailVerificationCode.update.mockResolvedValue({
        attempts: 1,
      });
      prismaMock.emailVerificationCode.updateMany.mockResolvedValue({
        count: 0,
      });

      const response = await verify(code);

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_CODE_EXPIRED');
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });

    it('does not report success when the address changed meanwhile', async () => {
      const { code, codeHash } = await sendCode();
      prismaMock.emailVerificationCode.findFirst.mockResolvedValue(
        storedCode({ codeHash }),
      );
      prismaMock.emailVerificationCode.update.mockResolvedValue({
        attempts: 1,
      });
      prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

      const response = await verify(code);

      expect(response.status).toBe(410);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_CODE_EXPIRED');
    });
  });
});
