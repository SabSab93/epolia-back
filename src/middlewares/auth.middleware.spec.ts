import { AccountStatus, UserRole } from '@prisma/client';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import {
  requireAuth,
  requireAuthAllowUnverified,
} from '@/middlewares/auth.middleware';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';

jest.mock('@/prisma/client', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

const findUser = prisma.user.findUnique as unknown as jest.Mock;

const userId = '0f2f2c96-8f55-4a42-86ad-b9d9981edb34';

function accountWith(emailVerifiedAt: Date | null) {
  return {
    id: userId,
    email: 'student@example.com',
    emailVerifiedAt,
    status: AccountStatus.ACTIVE,
    birthDate: new Date('2000-01-01T00:00:00Z'),
    roles: [{ role: UserRole.STUDENT }],
  };
}

function bearer() {
  const token = jwt.sign(
    { sub: userId, roles: [UserRole.STUDENT] },
    config.jwtSecret,
  );
  return `Bearer ${token}`;
}

function appWith(middleware: RequestHandler) {
  const app = express();
  app.get('/protected', middleware, (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('Auth middleware', () => {
  beforeEach(() => {
    findUser.mockReset();
  });

  it('refuses a token signed with another algorithm', async () => {
    findUser.mockResolvedValue(accountWith(new Date('2026-11-01')));
    const token = jwt.sign(
      { sub: userId, roles: [UserRole.STUDENT] },
      config.jwtSecret,
      { algorithm: 'HS512' },
    );

    const response = await request(appWith(requireAuth))
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it('refuses an unconfirmed e-mail by default', async () => {
    findUser.mockResolvedValue(accountWith(null));

    const response = await request(appWith(requireAuth))
      .get('/protected')
      .set('Authorization', bearer());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Confirm your e-mail address to continue',
    });
  });

  it('accepts a confirmed e-mail by default', async () => {
    findUser.mockResolvedValue(accountWith(new Date('2026-11-01')));

    const response = await request(appWith(requireAuth))
      .get('/protected')
      .set('Authorization', bearer());

    expect(response.status).toBe(200);
  });

  it('accepts an unconfirmed e-mail on account setup routes', async () => {
    findUser.mockResolvedValue(accountWith(null));

    const response = await request(appWith(requireAuthAllowUnverified))
      .get('/protected')
      .set('Authorization', bearer());

    expect(response.status).toBe(200);
  });

  it.each([
    ['requireAuth', requireAuth],
    ['requireAuthAllowUnverified', requireAuthAllowUnverified],
  ])('still requires a token with %s', async (_name, middleware) => {
    const response = await request(appWith(middleware)).get('/protected');

    expect(response.status).toBe(401);
    expect(findUser).not.toHaveBeenCalled();
  });

  it('checks the account status before the e-mail', async () => {
    findUser.mockResolvedValue({
      ...accountWith(null),
      status: AccountStatus.SUSPENDED,
    });

    const response = await request(appWith(requireAuth))
      .get('/protected')
      .set('Authorization', bearer());

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });
});
