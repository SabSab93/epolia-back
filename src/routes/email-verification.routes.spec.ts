import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { authRouter } from '@/routes/auth.routes';
import { emailVerificationRouter } from '@/routes/email-verification.routes';
import { sendEmail } from '@/services/email';

jest.mock('@/prisma/client', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    emailVerificationToken: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/services/email', () => ({ sendEmail: jest.fn() }));

type Mock = jest.Mock;
const prismaMock = prisma as unknown as {
  user: { findUnique: Mock; create: Mock; updateMany: Mock };
  emailVerificationToken: {
    findMany: Mock;
    findUnique: Mock;
    create: Mock;
    updateMany: Mock;
    delete: Mock;
  };
  $transaction: Mock;
};
const sendEmailMock = sendEmail as Mock;

const userId = '0f2f2c96-8f55-4a42-86ad-b9d9981edb34';
const email = 'user@example.com';
const token = 'a'.repeat(43);
const tokenHash = createHash('sha256').update(token).digest('hex');

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
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', authRouter);
  app.use('/api', emailVerificationRouter);
  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });
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

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-id',
    userId,
    email,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    user: { email },
    ...overrides,
  };
}

function confirm(value: unknown) {
  return request(createTestApp())
    .post('/api/auth/verify-email')
    .type('form')
    .send({ token: value });
}

function resend() {
  return request(createTestApp())
    .post('/api/auth/email-verification')
    .set('Authorization', authorization());
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
    prismaMock.emailVerificationToken.findMany.mockResolvedValue([]);
    sendEmailMock.mockResolvedValue(undefined);
    prismaMock.emailVerificationToken.delete.mockResolvedValue({});
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.emailVerificationToken.create.mockResolvedValue({
      id: 'new-token-id',
    });
  });

  describe('GET /auth/verify-email', () => {
    it('shows a confirmation button without consuming the link', async () => {
      const response = await request(createTestApp()).get(
        `/api/auth/verify-email?token=${token}`,
      );

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(response.text).toContain(
        '<form method="post" action="/api/auth/verify-email">',
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).toContain(`value="${token}"`);
      expect(
        prismaMock.emailVerificationToken.findUnique,
      ).not.toHaveBeenCalled();
    });

    it.each(['', 'short', `${'a'.repeat(42)}"`])(
      'explains an incorrect link %p without echoing it',
      async (value) => {
        const response = await request(createTestApp())
          .get('/api/auth/verify-email')
          .query({ token: value });

        expect(response.status).toBe(400);
        expect(response.text).toContain('Lien incorrect');
        expect(response.text).not.toContain('<form');
      },
    );
  });

  describe('POST /auth/verify-email', () => {
    it('confirms the address with a valid link', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(
        storedToken(),
      );
      prismaMock.emailVerificationToken.updateMany.mockResolvedValue({
        count: 1,
      });
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

      const response = await confirm(token);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Adresse e-mail confirmée');
      expect(prismaMock.emailVerificationToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash } }),
      );
      expect(prismaMock.emailVerificationToken.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: 'token-id',
            usedAt: null,
            expiresAt: { gt: expect.any(Date) },
          },
          data: { usedAt: expect.any(Date) },
        },
      );
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: userId, email, emailVerifiedAt: null },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it.each([
      ['an unknown link', null, 400, 'Lien incorrect'],
      [
        'a link sent to a previous address',
        storedToken({ user: { email: 'new@example.com' } }),
        400,
        'Lien incorrect',
      ],
      [
        'an already used link',
        storedToken({ usedAt: new Date() }),
        409,
        'Lien déjà utilisé',
      ],
      [
        'an expired or replaced link',
        storedToken({ expiresAt: new Date(Date.now() - 1000) }),
        410,
        'Lien expiré',
      ],
    ])('refuses %s', async (_label, record, status, title) => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(record);

      const response = await confirm(token);

      expect(response.status).toBe(status);
      expect(response.text).toContain(title);
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });

    it('reports a link consumed by a simultaneous click as already used', async () => {
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(
        storedToken(),
      );
      prismaMock.emailVerificationToken.updateMany.mockResolvedValue({
        count: 0,
      });

      const response = await confirm(token);

      expect(response.status).toBe(409);
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });

    it('offers a button back to the app when APP_RETURN_URL is set', async () => {
      jest.replaceProperty(config, 'appReturnUrl', 'epolia://email-verified');
      prismaMock.emailVerificationToken.findUnique.mockResolvedValue(
        storedToken(),
      );
      prismaMock.emailVerificationToken.updateMany.mockResolvedValue({
        count: 1,
      });

      const response = await confirm(token);

      expect(response.text).toContain('href="epolia://email-verified"');
      expect(response.text).toContain('Ouvrir l’application Epolia');
      jest.restoreAllMocks();
    });

    it('does not query the database for a malformed token', async () => {
      const response = await confirm('not-a-token');

      expect(response.status).toBe(400);
      expect(
        prismaMock.emailVerificationToken.findUnique,
      ).not.toHaveBeenCalled();
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

    it('sends a new link, stores only its hash and invalidates the previous ones', async () => {
      const response = await resend();

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ emailVerificationSent: true });
      expect(prismaMock.emailVerificationToken.updateMany).toHaveBeenCalledWith(
        {
          where: {
            userId,
            id: { not: 'new-token-id' },
            usedAt: null,
            expiresAt: { gt: expect.any(Date) },
          },
          data: { expiresAt: expect.any(Date) },
        },
      );

      const [created] = prismaMock.emailVerificationToken.create.mock
        .calls[0] as [{ data: { expiresAt: Date; tokenHash: string } }];
      const [sent] = sendEmailMock.mock.calls[0] as [
        { to: string; text: string },
      ];
      const sentToken = /token=([A-Za-z0-9_-]{43})/.exec(sent.text)?.[1] ?? '';
      expect(sent.to).toBe(email);
      expect(sentToken).toHaveLength(43);
      expect(created.data).toMatchObject({
        userId,
        email,
        tokenHash: createHash('sha256').update(sentToken).digest('hex'),
      });
      expect(created.data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        23 * 60 * 60 * 1000,
      );
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
      prismaMock.emailVerificationToken.findMany.mockResolvedValue(
        dates.map((createdAt) => ({ createdAt })),
      );

      const response = await resend();

      expect(response.status).toBe(429);
      expect(response.body.code).toBe('EMAIL_VERIFICATION_RATE_LIMITED');
      expect(prismaMock.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('reports a sending failure faithfully', async () => {
      sendEmailMock.mockRejectedValue(
        new AppError(502, 'EMAIL_SEND_FAILED', 'E-mail could not be sent'),
      );

      const response = await resend();

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('EMAIL_SEND_FAILED');
      // The unsent link is removed so it does not count against the limit.
      expect(prismaMock.emailVerificationToken.delete).toHaveBeenCalledWith({
        where: { id: 'new-token-id' },
      });
      // The previous link keeps working since no new e-mail was sent.
      expect(
        prismaMock.emailVerificationToken.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('keeps the sending error when the cleanup also fails', async () => {
      sendEmailMock.mockRejectedValue(
        new AppError(502, 'EMAIL_SEND_FAILED', 'E-mail could not be sent'),
      );
      prismaMock.emailVerificationToken.delete.mockRejectedValue(
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

  describe('POST /auth/register', () => {
    const registration = {
      email,
      password: 'password123',
      birthDate: '2000-01-01',
      firstName: 'Camille',
      lastName: 'Dupont',
      termsAccepted: true,
      termsVersion: 'terms-test-v1',
    };

    beforeEach(() => {
      jest.replaceProperty(config, 'registrationTermsVersion', 'terms-test-v1');
      prismaMock.user.create.mockResolvedValue({
        ...storedUser,
        passwordHash: 'salt:hash',
      });
    });

    afterEach(() => jest.restoreAllMocks());

    it('sends the confirmation link and returns an unverified account', async () => {
      const response = await request(createTestApp())
        .post('/api/auth/register')
        .send(registration);

      expect(response.status).toBe(201);
      expect(response.body.emailVerificationSent).toBe(true);
      expect(response.body.user.emailVerified).toBe(false);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the account when the e-mail cannot be sent', async () => {
      sendEmailMock.mockRejectedValue(
        new AppError(503, 'EMAIL_SERVICE_UNAVAILABLE', 'Not configured'),
      );

      const response = await request(createTestApp())
        .post('/api/auth/register')
        .send(registration);

      expect(response.status).toBe(201);
      expect(response.body.emailVerificationSent).toBe(false);
      expect(typeof response.body.accessToken).toBe('string');
    });
  });

  it('exposes the confirmed state on /auth/me', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...storedUser,
      emailVerifiedAt: new Date(),
    });

    const me = await request(createTestApp())
      .get('/api/auth/me')
      .set('Authorization', authorization());

    expect(me.status).toBe(200);
    expect(me.body.emailVerified).toBe(true);
  });
});
