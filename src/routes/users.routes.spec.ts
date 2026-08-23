import { AccountStatus, AuthProvider, UserRole } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { usersRouter } from '@/routes/users.routes';

jest.mock('../prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    authAccount: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    userRoleAssignment: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  return {
    prisma: mockPrisma,
  };
});

const userMock = {
  id: '0f2f2c96-8f55-4a42-86ad-b9d9981edb34',
  email: 'user@example.com',
  phone: '+33600000000',
  status: AccountStatus.ACTIVE,
  emailVerifiedAt: null,
  deletionRequestedAt: null,
  deletedAt: null,
  anonymizedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  roles: [
    {
      role: UserRole.ETUDIANT,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ],
};

type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;
type TransactionMock = <T>(
  callback: (tx: PrismaMock) => Promise<T>,
) => Promise<T>;

type PrismaMock = {
  user: {
    findUnique: SingleArgMock;
    create: SingleArgMock;
    update: SingleArgMock;
  };
  authAccount: {
    findUnique: SingleArgMock;
    deleteMany: SingleArgMock;
  };
  userRoleAssignment: {
    upsert: SingleArgMock;
    deleteMany: SingleArgMock;
  };
  $transaction: jest.MockedFunction<TransactionMock>;
};

const prismaMock = prisma as unknown as PrismaMock;

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api/v1', usersRouter);
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

describe('Users routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const transaction: TransactionMock = (callback) => callback(prismaMock);

    prismaMock.$transaction.mockImplementation(transaction);
  });

  it('returns a user by id', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userMock);

    const response = await request(createTestApp()).get(
      `/api/v1/users/${userMock.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: userMock.id,
      email: userMock.email,
      status: AccountStatus.ACTIVE,
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userMock.id },
      }),
    );

    const findCall = firstCallArg<{ select: Record<string, unknown> }>(
      prismaMock.user.findUnique,
    );
    expect(findCall.select).not.toHaveProperty('passwordHash');
  });

  it('returns 404 when a user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const response = await request(createTestApp()).get(
      `/api/v1/users/${userMock.id}`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 404,
      code: 'USER_NOT_FOUND',
      message: 'User not found',
    });
  });

  it('creates a local user with unique roles', async () => {
    prismaMock.user.create.mockResolvedValue(userMock);

    const response = await request(createTestApp())
      .post('/api/v1/users/local')
      .send({
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        phone: '+33600000000',
        roles: [UserRole.ETUDIANT, UserRole.ETUDIANT],
      });

    expect(response.status).toBe(201);
    expect(firstCallArg(prismaMock.user.create)).toMatchObject({
      data: {
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        phone: '+33600000000',
        roles: {
          create: [{ role: UserRole.ETUDIANT }],
        },
      },
    });
  });

  it('rejects local user creation without required fields', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/users/local')
      .send({ email: 'user@example.com' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'email and passwordHash are required',
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid role', async () => {
    const response = await request(createTestApp())
      .post(`/api/v1/users/${userMock.id}/roles`)
      .send({ role: 'INVALID' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'role is invalid',
    });
    expect(prismaMock.userRoleAssignment.upsert).not.toHaveBeenCalled();
  });

  it('finds a user by auth account', async () => {
    prismaMock.authAccount.findUnique.mockResolvedValue({ user: userMock });

    const response = await request(createTestApp()).get(
      '/api/v1/users/auth-accounts/GOOGLE/google-sub',
    );

    expect(response.status).toBe(200);
    expect(prismaMock.authAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.GOOGLE,
            providerAccountId: 'google-sub',
          },
        },
      }),
    );
  });

  it('updates a user status', async () => {
    prismaMock.user.update.mockResolvedValue({
      ...userMock,
      status: AccountStatus.SUSPENDED,
    });

    const response = await request(createTestApp())
      .patch(`/api/v1/users/${userMock.id}/status`)
      .send({ status: AccountStatus.SUSPENDED });

    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userMock.id },
        data: { status: AccountStatus.SUSPENDED },
      }),
    );
  });

  it('anonymizes a user and deletes auth accounts', async () => {
    prismaMock.authAccount.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.user.update.mockResolvedValue({
      ...userMock,
      email: null,
      phone: null,
      status: AccountStatus.DELETED,
    });

    const response = await request(createTestApp()).post(
      `/api/v1/users/${userMock.id}/anonymize`,
    );

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.authAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: userMock.id },
    });
    expect(firstCallArg(prismaMock.user.update)).toMatchObject({
      where: { id: userMock.id },
      data: {
        email: null,
        phone: null,
        passwordHash: null,
        status: AccountStatus.DELETED,
      },
    });
  });
});
