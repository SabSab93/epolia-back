import {
  AccountStatus,
  AuthProvider,
  Prisma,
  PrivacyRequestType,
  ProfileStatus,
  UserRole,
} from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { usersRouter } from '@/routes/users.routes';

jest.mock('@/prisma/client', () => {
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
    emailVerificationCode: {
      deleteMany: jest.fn(),
    },
    userRoleAssignment: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    privacyRequest: {
      create: jest.fn(),
    },
    adminAuditLog: { create: jest.fn() },
    userProfile: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    favorite: { deleteMany: jest.fn() },
    studentEducation: { deleteMany: jest.fn() },
    studentSpecialty: { deleteMany: jest.fn() },
    studentHobby: { deleteMany: jest.fn() },
    studentPortfolioItem: { deleteMany: jest.fn() },
    studentAvailability: { deleteMany: jest.fn() },
    studentVerification: { deleteMany: jest.fn() },
    studentProfile: { updateMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  return {
    prisma: mockPrisma,
  };
});

const userMock = {
  birthDate: new Date('2000-01-01T00:00:00Z'),
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
      role: UserRole.STUDENT,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ],
};

const adminUserMock = {
  ...userMock,
  birthDate: null,
  id: 'b42c1e76-cfc8-4f38-84c7-3c2f304285d0',
  email: 'admin@example.com',
  roles: [
    {
      role: UserRole.ADMIN,
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
  emailVerificationCode: {
    deleteMany: SingleArgMock;
  };
  userRoleAssignment: {
    upsert: SingleArgMock;
    deleteMany: SingleArgMock;
    count: SingleArgMock;
  };
  privacyRequest: {
    create: SingleArgMock;
  };
  adminAuditLog: { create: SingleArgMock };
  userProfile: { deleteMany: SingleArgMock };
  notification: { deleteMany: SingleArgMock };
  favorite: { deleteMany: SingleArgMock };
  studentEducation: { deleteMany: SingleArgMock };
  studentSpecialty: { deleteMany: SingleArgMock };
  studentHobby: { deleteMany: SingleArgMock };
  studentPortfolioItem: { deleteMany: SingleArgMock };
  studentAvailability: { deleteMany: SingleArgMock };
  studentVerification: { deleteMany: SingleArgMock };
  studentProfile: { updateMany: SingleArgMock };
  $transaction: jest.MockedFunction<TransactionMock>;
};

const prismaMock = prisma as unknown as PrismaMock;

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api', usersRouter);
  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });
  app.use(errorHandler);

  return app;
}

function firstCallArg<T>(mock: SingleArgMock): T {
  return callArg<T>(mock, 0);
}

function secondCallArg<T>(mock: SingleArgMock): T {
  return callArg<T>(mock, 1);
}

function callArg<T>(mock: SingleArgMock, index: number): T {
  const call = mock.mock.calls[index];

  if (!call) {
    throw new Error('Expected mock to have been called');
  }

  return call[0] as T;
}

function createAdminAccessToken() {
  return jwt.sign(
    {
      sub: adminUserMock.id,
      email: adminUserMock.email,
      roles: [UserRole.ADMIN],
    },
    config.jwtSecret,
  );
}

function createCustomerAccessToken() {
  return jwt.sign(
    {
      sub: userMock.id,
      email: userMock.email,
      roles: [UserRole.CUSTOMER],
    },
    config.jwtSecret,
  );
}

function adminAuthorizationHeader() {
  return `Bearer ${createAdminAccessToken()}`;
}

describe('Users routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const transaction: TransactionMock = (callback) => callback(prismaMock);

    prismaMock.$transaction.mockImplementation(transaction);
    prismaMock.user.findUnique.mockResolvedValue(userMock);
    prismaMock.user.findUnique.mockResolvedValueOnce(adminUserMock);
    // Another active admin exists unless a test says otherwise.
    prismaMock.userRoleAssignment.count.mockResolvedValue(1);
  });

  it('rejects users routes without a token', async () => {
    const response = await request(createTestApp()).get(
      `/api/users/${userMock.id}`,
    );

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });

  it('rejects users routes for a non admin user', async () => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.findUnique.mockResolvedValueOnce(userMock);

    const response = await request(createTestApp())
      .get(`/api/users/${userMock.id}`)
      .set('Authorization', `Bearer ${createCustomerAccessToken()}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
  });

  it('returns a user by id', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(userMock);

    const response = await request(createTestApp())
      .get(`/api/users/${userMock.id}`)
      .set('Authorization', adminAuthorizationHeader());

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

    const findCall = secondCallArg<{ select: Record<string, unknown> }>(
      prismaMock.user.findUnique,
    );
    expect(findCall.select).not.toHaveProperty('passwordHash');
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toEqual({
      data: {
        adminUserId: adminUserMock.id,
        action: 'USER_VIEWED',
        targetType: 'USER',
        targetId: userMock.id,
        details: { lookup: 'ID' },
      },
    });
  });

  it('returns 404 when a user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const response = await request(createTestApp())
      .get(`/api/users/${userMock.id}`)
      .set('Authorization', adminAuthorizationHeader());

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
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        birthDate: '2000-01-01',
        email: ' User@Example.com ',
        password: 'password123',
        phone: '+33600000000',
        roles: [UserRole.STUDENT, UserRole.STUDENT],
      });

    expect(response.status).toBe(201);
    const createCall = firstCallArg<{ data: { passwordHash: string } }>(
      prismaMock.user.create,
    );
    expect(createCall).toMatchObject({
      data: {
        email: 'user@example.com',
        phone: '+33600000000',
        roles: {
          create: [{ role: UserRole.STUDENT }],
        },
      },
    });
    // Hashed by the server: salt and scrypt hash, never the password itself.
    expect(createCall.data.passwordHash).toMatch(
      /^[0-9a-f]{32}:[0-9a-f]{128}$/,
    );
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toEqual({
      data: {
        adminUserId: adminUserMock.id,
        action: 'USER_CREATED',
        targetType: 'USER',
        targetId: userMock.id,
        details: { roles: [UserRole.STUDENT] },
      },
    });
  });

  it('rejects a password shorter than 8 characters', async () => {
    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        birthDate: '2000-01-01',
        email: 'user@example.com',
        password: 'short',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone number', async () => {
    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        birthDate: '2000-01-01',
        email: 'user@example.com',
        password: 'password123',
        phone: 'not-a-phone',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('phone is invalid');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('answers 409 when the e-mail is already used', async () => {
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        birthDate: '2000-01-01',
        email: 'user@example.com',
        password: 'password123',
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EMAIL_ALREADY_USED');
  });

  it('searches a user by e-mail in lower case', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(userMock);

    const response = await request(createTestApp())
      .get('/api/users/by-email')
      .query({ email: ' User@Example.com ' })
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(200);
    expect(secondCallArg(prismaMock.user.findUnique)).toMatchObject({
      where: { email: 'user@example.com' },
    });
    // How the account was found, never the e-mail searched for.
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toMatchObject({
      data: {
        action: 'USER_VIEWED',
        targetId: userMock.id,
        details: { lookup: 'EMAIL' },
      },
    });
  });

  it('does not record a search that found nobody', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const response = await request(createTestApp())
      .get('/api/users/by-email')
      .query({ email: 'missing@example.com' })
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(404);
    expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('answers 400 for an invalid user id', async () => {
    const response = await request(createTestApp())
      .get('/api/users/not-a-uuid')
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'userId is invalid',
    });
    // Only the admin session was read.
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('answers 404 when changing the status of a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const response = await request(createTestApp())
      .patch(`/api/users/${userMock.id}/status`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ status: AccountStatus.SUSPENDED });

    expect(response.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('removes a role and records it', async () => {
    prismaMock.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(createTestApp())
      .delete(`/api/users/${userMock.id}/roles/${UserRole.STUDENT}`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(204);
    expect(prismaMock.userRoleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: userMock.id, role: UserRole.STUDENT },
    });
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toMatchObject({
      data: { action: 'ROLE_REMOVED', targetId: userMock.id },
    });
  });

  it('refuses to remove the ADMIN role from the last active admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue(adminUserMock);
    prismaMock.userRoleAssignment.count.mockResolvedValue(0);

    const response = await request(createTestApp())
      .delete(`/api/users/${adminUserMock.id}/roles/${UserRole.ADMIN}`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LAST_ADMIN');
    expect(prismaMock.userRoleAssignment.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('does not record a role removal that changed nothing', async () => {
    prismaMock.userRoleAssignment.deleteMany.mockResolvedValue({ count: 0 });

    const response = await request(createTestApp())
      .delete(`/api/users/${userMock.id}/roles/${UserRole.CUSTOMER}`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(204);
    expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('counts only the other active admins', async () => {
    prismaMock.user.findUnique.mockResolvedValue(adminUserMock);
    prismaMock.userRoleAssignment.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(createTestApp())
      .delete(`/api/users/${adminUserMock.id}/roles/${UserRole.ADMIN}`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(204);
    expect(prismaMock.userRoleAssignment.count).toHaveBeenCalledWith({
      where: {
        role: UserRole.ADMIN,
        userId: { not: adminUserMock.id },
        user: { status: AccountStatus.ACTIVE },
      },
    });
  });

  it('refuses to anonymize the last active admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue(adminUserMock);
    prismaMock.userRoleAssignment.count.mockResolvedValue(0);

    const response = await request(createTestApp())
      .post(`/api/users/${adminUserMock.id}/anonymize`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LAST_ADMIN');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['patch', 'status', { status: AccountStatus.ACTIVE }],
    ['post', 'deletion-request', {}],
    ['post', 'anonymize', {}],
  ] as const)(
    'refuses %s /%s on an anonymized account',
    async (method, path, body) => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...adminUserMock,
        status: AccountStatus.DELETED,
        anonymizedAt: new Date('2026-11-01'),
      });

      const response = await request(createTestApp())
        [method](`/api/users/${userMock.id}/${path}`)
        .set('Authorization', adminAuthorizationHeader())
        .send(body);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ACCOUNT_ANONYMIZED');
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['post', 'roles', { role: UserRole.CUSTOMER }],
    ['delete', `roles/${UserRole.CUSTOMER}`, {}],
    ['post', 'deletion-request', {}],
    ['post', 'anonymize', {}],
  ] as const)(
    'answers 404 on %s /%s for a missing user',
    async (method, path, body) => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(createTestApp())
        [method](`/api/users/${userMock.id}/${path}`)
        .set('Authorization', adminAuthorizationHeader())
        .send(body);

      expect(response.status).toBe(404);
      expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
    },
  );

  it('records a new role but not one already held', async () => {
    prismaMock.userRoleAssignment.upsert.mockResolvedValue({
      userId: userMock.id,
      role: UserRole.CUSTOMER,
    });

    const added = await request(createTestApp())
      .post(`/api/users/${userMock.id}/roles`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ role: UserRole.CUSTOMER });
    expect(added.status).toBe(200);
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toMatchObject({
      data: { action: 'ROLE_ADDED', details: { role: UserRole.CUSTOMER } },
    });

    prismaMock.adminAuditLog.create.mockClear();
    prismaMock.user.findUnique.mockResolvedValueOnce(adminUserMock);
    const again = await request(createTestApp())
      .post(`/api/users/${userMock.id}/roles`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ role: UserRole.STUDENT });
    expect(again.status).toBe(200);
    expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid e-mail address', async () => {
    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        birthDate: '2000-01-01',
        email: 'abc',
        password: 'password123',
      });

    expect(response.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('says when the phone number is already used', async () => {
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['phone'] },
      }),
    );

    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        birthDate: '2000-01-01',
        email: 'user@example.com',
        password: 'password123',
        phone: '+33600000000',
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PHONE_ALREADY_USED');
  });

  it('does not record a status that did not change', async () => {
    prismaMock.user.update.mockResolvedValue(userMock);

    const response = await request(createTestApp())
      .patch(`/api/users/${userMock.id}/status`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ status: AccountStatus.ACTIVE });

    expect(response.status).toBe(200);
    expect(prismaMock.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('refuses a second deletion request for the same account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      deletionRequestedAt: new Date('2026-11-01'),
    });

    const response = await request(createTestApp())
      .post(`/api/users/${userMock.id}/deletion-request`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DELETION_ALREADY_REQUESTED');
    expect(prismaMock.privacyRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('refuses to suspend the last active admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue(adminUserMock);
    prismaMock.userRoleAssignment.count.mockResolvedValue(0);

    const response = await request(createTestApp())
      .patch(`/api/users/${adminUserMock.id}/status`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ status: AccountStatus.SUSPENDED });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LAST_ADMIN');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects local user creation without required fields', async () => {
    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        birthDate: '2000-01-01',
        email: 'user@example.com',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'email and password with at least 8 characters are required',
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid role', async () => {
    const response = await request(createTestApp())
      .post(`/api/users/${userMock.id}/roles`)
      .set('Authorization', adminAuthorizationHeader())
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

    const response = await request(createTestApp())
      .get('/api/users/auth-accounts/GOOGLE/google-sub')
      .set('Authorization', adminAuthorizationHeader());

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
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toMatchObject({
      data: {
        action: 'USER_VIEWED',
        targetId: userMock.id,
        details: { lookup: 'AUTH_ACCOUNT' },
      },
    });
  });

  it('updates a user status', async () => {
    prismaMock.user.update.mockResolvedValue({
      ...userMock,
      status: AccountStatus.SUSPENDED,
    });

    const response = await request(createTestApp())
      .patch(`/api/users/${userMock.id}/status`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ status: AccountStatus.SUSPENDED });

    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userMock.id },
        data: { status: AccountStatus.SUSPENDED },
      }),
    );
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toMatchObject({
      data: {
        action: 'STATUS_CHANGED',
        targetId: userMock.id,
        details: { from: AccountStatus.ACTIVE, to: AccountStatus.SUSPENDED },
      },
    });
  });

  it('anonymizes a user and deletes their personal data', async () => {
    prismaMock.authAccount.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.emailVerificationCode.deleteMany.mockResolvedValue({
      count: 1,
    });
    prismaMock.user.update.mockResolvedValue({
      ...userMock,
      email: null,
      phone: null,
      status: AccountStatus.DELETED,
    });

    const response = await request(createTestApp())
      .post(`/api/users/${userMock.id}/anonymize`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.authAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: userMock.id },
    });
    expect(prismaMock.emailVerificationCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: userMock.id },
    });
    expect(prismaMock.userProfile.deleteMany).toHaveBeenCalledWith({
      where: { userId: userMock.id },
    });
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: { userId: userMock.id },
    });
    expect(prismaMock.favorite.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ customerUserId: userMock.id }, { studentId: userMock.id }],
      },
    });
    for (const studentData of [
      prismaMock.studentEducation,
      prismaMock.studentSpecialty,
      prismaMock.studentHobby,
      prismaMock.studentPortfolioItem,
      prismaMock.studentAvailability,
      prismaMock.studentVerification,
    ]) {
      expect(studentData.deleteMany).toHaveBeenCalledWith({
        where: { studentId: userMock.id },
      });
    }
    expect(prismaMock.studentProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: userMock.id },
      data: {
        title: null,
        description: null,
        status: ProfileStatus.DRAFT,
      },
    });
    expect(firstCallArg(prismaMock.user.update)).toMatchObject({
      where: { id: userMock.id },
      data: {
        email: null,
        phone: null,
        passwordHash: null,
        birthDate: null,
        status: AccountStatus.DELETED,
      },
    });
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toMatchObject({
      data: { action: 'USER_ANONYMIZED', targetId: userMock.id },
    });
  });

  it('creates a GDPR deletion request for a user', async () => {
    prismaMock.privacyRequest.create.mockResolvedValue({
      id: '7aa348fc-1894-401f-8f56-e41a0c5d33d9',
      userId: userMock.id,
      type: PrivacyRequestType.DELETION,
    });
    prismaMock.user.update.mockResolvedValue(userMock);

    const response = await request(createTestApp())
      .post(`/api/users/${userMock.id}/deletion-request`)
      .set('Authorization', adminAuthorizationHeader());

    expect(response.status).toBe(200);
    expect(prismaMock.privacyRequest.create).toHaveBeenCalledWith({
      data: {
        userId: userMock.id,
        type: PrivacyRequestType.DELETION,
      },
    });
    expect(firstCallArg(prismaMock.user.update)).toMatchObject({
      where: { id: userMock.id },
      data: {
        deletionRequestedAt: expect.any(Date),
      },
    });
    expect(firstCallArg(prismaMock.adminAuditLog.create)).toMatchObject({
      data: { action: 'DELETION_REQUESTED', targetId: userMock.id },
    });
  });
  it('requires an adult birth date for admin-created accounts', async () => {
    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        email: 'new@example.com',
        password: 'password123',
        roles: [UserRole.CUSTOMER],
      });
    expect(response.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('creates an ADMIN without collecting a birth date', async () => {
    prismaMock.user.create.mockResolvedValue(adminUserMock);
    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        email: 'new-admin@example.com',
        password: 'password123',
        roles: [UserRole.ADMIN],
      });
    expect(response.status).toBe(201);
    expect(
      firstCallArg<{ data: { birthDate: Date | null } }>(prismaMock.user.create)
        .data.birthDate,
    ).toBeNull();
  });

  it('reactivates an ADMIN without an age check', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...adminUserMock,
      status: AccountStatus.SUSPENDED,
    });
    prismaMock.user.update.mockResolvedValue(adminUserMock);
    const response = await request(createTestApp())
      .patch(`/api/users/${adminUserMock.id}/status`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ status: AccountStatus.ACTIVE });
    expect(response.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it('allows an authorized administrator to assign ADMIN without collecting a birth date', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      birthDate: null,
      roles: [],
    });
    prismaMock.userRoleAssignment.upsert.mockResolvedValue({
      userId: userMock.id,
      role: UserRole.ADMIN,
    });
    const response = await request(createTestApp())
      .post(`/api/users/${userMock.id}/roles`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ role: UserRole.ADMIN });
    expect(response.status).toBe(200);
    expect(prismaMock.userRoleAssignment.upsert).toHaveBeenCalled();
  });

  it.each([
    ['ADMIN to a student', userMock, UserRole.ADMIN],
    ['CUSTOMER to an admin', adminUserMock, UserRole.CUSTOMER],
  ])('refuses to add %s', async (_case, target, role) => {
    prismaMock.user.findUnique.mockResolvedValue(target);

    const response = await request(createTestApp())
      .post(`/api/users/${target.id}/roles`)
      .set('Authorization', adminAuthorizationHeader())
      .send({ role });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ADMIN_ROLE_EXCLUSIVE');
    expect(prismaMock.userRoleAssignment.upsert).not.toHaveBeenCalled();
  });

  it('refuses to create an account mixing ADMIN with another role', async () => {
    const response = await request(createTestApp())
      .post('/api/users/local')
      .set('Authorization', adminAuthorizationHeader())
      .send({
        email: 'mixed@example.com',
        password: 'password123',
        roles: [UserRole.ADMIN, UserRole.STUDENT],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('ADMIN_ROLE_EXCLUSIVE');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it.each([null, new Date('2020-01-01')])(
    'blocks role assignment and reactivation without an adult birth date: %p',
    async (birthDate) => {
      prismaMock.user.findUnique.mockResolvedValue({ ...userMock, birthDate });
      const role = await request(createTestApp())
        .post(`/api/users/${userMock.id}/roles`)
        .set('Authorization', adminAuthorizationHeader())
        .send({ role: UserRole.CUSTOMER });
      expect(role.status).toBe(403);
      expect(prismaMock.userRoleAssignment.upsert).not.toHaveBeenCalled();
      // Supply the admin session again for the second HTTP request.
      prismaMock.user.findUnique.mockResolvedValueOnce(adminUserMock);
      const active = await request(createTestApp())
        .patch(`/api/users/${userMock.id}/status`)
        .set('Authorization', adminAuthorizationHeader())
        .send({ status: AccountStatus.ACTIVE });
      expect(active.status).toBe(403);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    },
  );
});
