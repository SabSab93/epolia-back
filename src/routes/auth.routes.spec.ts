import { AccountStatus, UserRole } from '@prisma/client';
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
  app.use('/api/v1', authRouter);
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
      .post('/api/v1/auth/register')
      .send({
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

    await request(createTestApp()).post('/api/v1/auth/register').send({
      email: userMock.email,
      password: 'password123',
    });

    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      passwordHash,
    });

    const response = await request(createTestApp())
      .post('/api/v1/auth/login')
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
      .post('/api/v1/auth/login')
      .send({
        email: 'missing@example.com',
        password: 'password123',
      });

    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      passwordHash: 'salt:invalid',
    });

    const wrongPasswordResponse = await request(createTestApp())
      .post('/api/v1/auth/login')
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

    await request(createTestApp()).post('/api/v1/auth/register').send({
      email: userMock.email,
      password: 'password123',
    });

    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      status: AccountStatus.SUSPENDED,
      passwordHash,
    });

    const response = await request(createTestApp())
      .post('/api/v1/auth/login')
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
      .get('/api/v1/auth/me')
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
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'Account is not active',
    });
  });

  it('rejects authenticated routes without a token', async () => {
    const response = await request(createTestApp()).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });
});
