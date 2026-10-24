import { AccountStatus, UserRole } from '@prisma/client';
import { scryptSync } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { authRouter } from '@/routes/auth.routes';

jest.mock('@/prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  return {
    prisma: mockPrisma,
  };
});

const userMock = {
  birthDate: new Date('2000-01-01T00:00:00Z'),
  id: '0f2f2c96-8f55-4a42-86ad-b9d9981edb34',
  email: 'user@example.com',
  status: AccountStatus.ACTIVE,
  passwordHash: 'salt:hash',
  roles: [
    {
      role: UserRole.CUSTOMER,
    },
  ],
};

type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  user: {
    findUnique: SingleArgMock;
    create: SingleArgMock;
  };
};

const prismaMock = prisma as unknown as PrismaMock;

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api', authRouter);
  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });
  app.use(errorHandler);

  return app;
}

function firstCallArg<T>(mock: SingleArgMock): T {
  const call = mock.mock.calls[0];

  if (!call) {
    throw new Error('Expected mock to have been called');
  }

  return call[0] as T;
}

describe('Auth routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('allows an active ADMIN to log in and use protected routes without a birth date', async () => {
    const password = 'admin-test-password';
    const salt = 'admin-test-salt';
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      birthDate: null,
      roles: [{ role: UserRole.ADMIN }],
      passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
    });
    const login = await request(createTestApp())
      .post('/api/auth/login')
      .send({ email: userMock.email, password });
    expect(login.status).toBe(200);
    const me = await request(createTestApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.roles).toEqual([UserRole.ADMIN]);
    expect(me.body).not.toHaveProperty('birthDate');
  });

  it('uses stored roles rather than an ADMIN claim to decide the exemption', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      birthDate: null,
    });
    const token = jwt.sign(
      { sub: userMock.id, roles: [UserRole.ADMIN] },
      config.jwtSecret,
    );
    const response = await request(createTestApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('BIRTH_DATE_REQUIRED');
  });

  it('does not allow public registration to request the ADMIN exemption', async () => {
    const response = await request(createTestApp())
      .post('/api/auth/register')
      .send({
        email: userMock.email,
        password: 'password123',
        role: UserRole.ADMIN,
      });
    expect(response.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('registers a local user with a hashed password', async () => {
    prismaMock.user.create.mockImplementation(async (args) => {
      const createArgs = args as {
        data: {
          email: string;
          passwordHash: string;
          status: AccountStatus;
          roles: { create: { role: UserRole }[] };
        };
      };

      return {
        ...userMock,
        email: createArgs.data.email,
        passwordHash: createArgs.data.passwordHash,
        roles: createArgs.data.roles.create,
      };
    });

    const response = await request(createTestApp())
      .post('/api/auth/register')
      .send({
        birthDate: '2000-01-01',
        email: 'USER@example.com',
        password: 'password123',
        role: UserRole.STUDENT,
      });

    const createCall = firstCallArg<{
      data: {
        email: string;
        passwordHash: string;
        roles: { create: { role: UserRole }[] };
      };
    }>(prismaMock.user.create);

    expect(response.status).toBe(201);
    expect(createCall.data.email).toBe('user@example.com');
    expect(createCall.data.passwordHash).not.toBe('password123');
    expect(createCall.data.passwordHash).toContain(':');
    expect(createCall.data.roles.create).toEqual([{ role: UserRole.STUDENT }]);
    expect(response.body.user).toMatchObject({
      email: 'user@example.com',
      roles: [UserRole.STUDENT],
    });
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('logs in with a valid password', async () => {
    let passwordHash = '';

    prismaMock.user.create.mockImplementation(async (args) => {
      const createArgs = args as { data: { passwordHash: string } };
      passwordHash = createArgs.data.passwordHash;

      return {
        ...userMock,
        passwordHash,
      };
    });

    await request(createTestApp()).post('/api/auth/register').send({
      birthDate: '2000-01-01',
      email: userMock.email,
      password: 'password123',
    });

    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      passwordHash,
    });

    const response = await request(createTestApp())
      .post('/api/auth/login')
      .send({
        email: userMock.email,
        password: 'password123',
      });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: userMock.id,
      email: userMock.email,
      status: AccountStatus.ACTIVE,
      roles: [UserRole.CUSTOMER],
    });
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('uses the same error for an unknown email or a wrong password', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const unknownEmailResponse = await request(createTestApp())
      .post('/api/auth/login')
      .send({
        email: 'missing@example.com',
        password: 'password123',
      });

    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      passwordHash: 'salt:invalid',
    });

    const wrongPasswordResponse = await request(createTestApp())
      .post('/api/auth/login')
      .send({
        email: userMock.email,
        password: 'wrong-password',
      });

    expect(unknownEmailResponse.status).toBe(401);
    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownEmailResponse.body).toEqual(wrongPasswordResponse.body);
    expect(unknownEmailResponse.body).toEqual({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  it('rejects login for inactive accounts', async () => {
    let passwordHash = '';

    prismaMock.user.create.mockImplementation(async (args) => {
      const createArgs = args as { data: { passwordHash: string } };
      passwordHash = createArgs.data.passwordHash;

      return {
        ...userMock,
        passwordHash,
      };
    });

    await request(createTestApp()).post('/api/auth/register').send({
      birthDate: '2000-01-01',
      email: userMock.email,
      password: 'password123',
    });

    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      status: AccountStatus.SUSPENDED,
      passwordHash,
    });

    const response = await request(createTestApp())
      .post('/api/auth/login')
      .send({
        email: userMock.email,
        password: 'password123',
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'Account is not active',
    });
  });

  it('rejects login for anonymized accounts', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      email: null,
      status: AccountStatus.DELETED,
      passwordHash: null,
    });

    const response = await request(createTestApp())
      .post('/api/auth/login')
      .send({
        email: userMock.email,
        password: 'password123',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  it('returns every role for a multi-role authenticated user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      roles: [{ role: UserRole.CUSTOMER }, { role: UserRole.STUDENT }],
    });

    const accessToken = jwt.sign(
      {
        sub: userMock.id,
        email: userMock.email,
        roles: [UserRole.CUSTOMER, UserRole.STUDENT],
      },
      config.jwtSecret,
    );

    const response = await request(createTestApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: userMock.id,
      email: userMock.email,
      roles: [UserRole.CUSTOMER, UserRole.STUDENT],
    });
  });

  it('returns the authenticated user from the JWT', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userMock);

    const accessToken = jwt.sign(
      {
        sub: userMock.id,
        email: userMock.email,
        roles: [UserRole.CUSTOMER],
      },
      config.jwtSecret,
    );

    const response = await request(createTestApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: userMock.id,
      email: userMock.email,
      roles: [UserRole.CUSTOMER],
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: userMock.id },
      select: {
        id: true,
        email: true,
        status: true,
        birthDate: true,
        roles: {
          select: {
            role: true,
          },
        },
      },
    });
  });

  it('rejects a valid JWT when the account is not active anymore', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      status: AccountStatus.SUSPENDED,
    });

    const accessToken = jwt.sign(
      {
        sub: userMock.id,
        email: userMock.email,
        roles: [UserRole.CUSTOMER],
      },
      config.jwtSecret,
    );

    const response = await request(createTestApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'Account is not active',
    });
  });

  it('rejects authenticated routes without a token', async () => {
    const response = await request(createTestApp()).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });
  it.each([UserRole.CUSTOMER, UserRole.STUDENT])(
    'requires an adult birth date before registering %s',
    async (role) => {
      for (const [birthDate, status] of [
        [undefined, 400],
        ['2099-01-01', 400],
        ['2001-02-29', 400],
        ['2020-01-01', 403],
      ] as const) {
        const response = await request(createTestApp())
          .post('/api/auth/register')
          .send({
            email: 'new@example.com',
            password: 'password123',
            role,
            birthDate,
          });
        expect(response.status).toBe(status);
        expect(prismaMock.user.create).not.toHaveBeenCalled();
      }
    },
  );

  it('does not expose birth dates through register, login, JWT or auth/me', async () => {
    prismaMock.user.create.mockImplementation(async (args) => ({
      ...userMock,
      passwordHash: (args as { data: { passwordHash: string } }).data
        .passwordHash,
    }));
    const registered = await request(createTestApp())
      .post('/api/auth/register')
      .send({
        email: userMock.email,
        password: 'password123',
        birthDate: '2000-01-01',
      });
    expect(registered.status).toBe(201);
    expect(registered.body.user).not.toHaveProperty('birthDate');
    expect(
      jwt.verify(registered.body.accessToken, config.jwtSecret),
    ).not.toHaveProperty('birthDate');
    const created = firstCallArg<{ data: { passwordHash: string } }>(
      prismaMock.user.create,
    );
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      passwordHash: created.data.passwordHash,
    });
    const login = await request(createTestApp())
      .post('/api/auth/login')
      .send({ email: userMock.email, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.user).not.toHaveProperty('birthDate');
    const me = await request(createTestApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).not.toHaveProperty('birthDate');
  });

  it.each([null, new Date('2020-01-01')])(
    'rejects login and old JWT access with an ineligible stored birth date: %p',
    async (birthDate) => {
      prismaMock.user.create.mockImplementation(async (args) => ({
        ...userMock,
        passwordHash: (args as { data: { passwordHash: string } }).data
          .passwordHash,
      }));
      const registered = await request(createTestApp())
        .post('/api/auth/register')
        .send({
          email: userMock.email,
          password: 'password123',
          birthDate: '2000-01-01',
        });
      const created = firstCallArg<{ data: { passwordHash: string } }>(
        prismaMock.user.create,
      );
      prismaMock.user.findUnique.mockResolvedValue({
        ...userMock,
        birthDate,
        passwordHash: created.data.passwordHash,
      });
      const login = await request(createTestApp())
        .post('/api/auth/login')
        .send({
          email: userMock.email,
          password: 'password123',
          birthDate: '2000-01-01',
        });
      expect(login.status).toBe(403);
      expect(login.body.code).toBe(
        birthDate ? 'ADULT_REQUIRED' : 'BIRTH_DATE_REQUIRED',
      );
      const me = await request(createTestApp())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${registered.body.accessToken}`);
      expect(me.status).toBe(403);
    },
  );
});
