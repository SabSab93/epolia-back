import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { authRouter } from '@/routes/auth.routes';

jest.mock('@/prisma/client', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    userRoleAssignment: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
  userRoleAssignment: { createMany: jest.Mock };
  $transaction: jest.Mock;
};
const account = {
  id: '0f2f2c96-8f55-4a42-86ad-b9d9981edb34',
  email: 'user@example.com',
  status: AccountStatus.ACTIVE,
  birthDate: new Date('2000-01-01'),
  roles: [{ role: UserRole.CUSTOMER }],
};
const app = express();
app.use(express.json());
app.use('/api', authRouter);
app.use(errorHandler);

function authorization(roles: UserRole[] = [UserRole.CUSTOMER]) {
  return `Bearer ${jwt.sign({ sub: account.id, roles }, config.jwtSecret)}`;
}

describe('Activating a role on the authenticated account', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.user.findUnique.mockResolvedValue(account);
    db.user.findUniqueOrThrow.mockResolvedValue({
      ...account,
      roles: [{ role: UserRole.CUSTOMER }, { role: UserRole.STUDENT }],
    });
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
      callback(db),
    );
  });

  it('retries a serialization conflict and returns the updated roles', async () => {
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: '6.19.3',
      }),
    );
    const response = await request(app)
      .post('/api/auth/roles')
      .set('Authorization', authorization())
      .send({ role: UserRole.STUDENT });
    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it('bounds retries and returns a recoverable conflict after three failures', async () => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: '6.19.3',
      }),
    );
    const response = await request(app)
      .post('/api/auth/roles')
      .set('Authorization', authorization())
      .send({ role: UserRole.STUDENT });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ROLE_ACTIVATION_CONFLICT');
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    [UserRole.CUSTOMER, UserRole.STUDENT],
    [UserRole.STUDENT, UserRole.CUSTOMER],
  ])(
    'activates %s -> %s on the same account and renews its roles in the JWT',
    async (initial, added) => {
      db.user.findUnique.mockResolvedValue({
        ...account,
        roles: [{ role: initial }],
      });
      const response = await request(app)
        .post('/api/auth/roles')
        .set('Authorization', authorization([initial]))
        .send({ role: added });
      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(account.id);
      expect(response.body.user.roles).toEqual(
        expect.arrayContaining([initial, added]),
      );
      expect(db.userRoleAssignment.createMany).toHaveBeenCalledWith({
        data: { userId: account.id, role: added },
        skipDuplicates: true,
      });
      const payload = jwt.verify(
        response.body.accessToken,
        config.jwtSecret,
      ) as jwt.JwtPayload;
      expect(payload.sub).toBe(account.id);
      expect(payload.roles).toEqual(response.body.user.roles);
      expect(payload).not.toHaveProperty('birthDate');
      expect(response.body.user).not.toHaveProperty('birthDate');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    },
  );

  it('returns the current roles on repeated activation and lets an old token read them', async () => {
    const token = authorization();
    for (let i = 0; i < 2; i++) {
      const response = await request(app)
        .post('/api/auth/roles')
        .set('Authorization', token)
        .send({ role: UserRole.STUDENT });
      expect(response.status).toBe(200);
      expect(response.body.user.roles).toEqual([
        UserRole.CUSTOMER,
        UserRole.STUDENT,
      ]);
    }
    db.user.findUnique.mockResolvedValue({
      ...account,
      roles: [{ role: UserRole.CUSTOMER }, { role: UserRole.STUDENT }],
    });
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', token);
    expect(me.status).toBe(200);
    expect(me.body.roles).toEqual([UserRole.CUSTOMER, UserRole.STUDENT]);
  });

  it('ignores a supplied userId and changes only the authenticated account', async () => {
    await request(app)
      .post('/api/auth/roles')
      .set('Authorization', authorization())
      .send({
        role: UserRole.STUDENT,
        userId: 'b42c1e76-cfc8-4f38-84c7-3c2f304285d0',
      });
    expect(db.userRoleAssignment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: account.id, role: UserRole.STUDENT },
      }),
    );
  });

  it.each([undefined, null, '', 'ADMIN', 'student', ['STUDENT'], 1])(
    'rejects unauthorized or invalid roles: %p',
    async (role) => {
      const response = await request(app)
        .post('/api/auth/roles')
        .set('Authorization', authorization())
        .send({ role });
      expect(response.status).toBe(400);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/auth/roles')
      .send({ role: UserRole.STUDENT });
    expect(response.status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([null, new Date('2020-01-01')])(
    'blocks an ineligible ordinary account: %p',
    async (birthDate) => {
      db.user.findUnique.mockResolvedValue({ ...account, birthDate });
      const response = await request(app)
        .post('/api/auth/roles')
        .set('Authorization', authorization())
        .send({ role: UserRole.STUDENT });
      expect(response.status).toBe(403);
      expect(db.userRoleAssignment.createMany).not.toHaveBeenCalled();
    },
  );

  it('keeps ADMIN exempt from age checks but still refuses self-assignment of ADMIN', async () => {
    db.user.findUnique.mockResolvedValue({
      ...account,
      birthDate: null,
      roles: [{ role: UserRole.ADMIN }],
    });
    db.user.findUniqueOrThrow.mockResolvedValue({
      ...account,
      birthDate: null,
      roles: [{ role: UserRole.ADMIN }, { role: UserRole.CUSTOMER }],
    });
    const response = await request(app)
      .post('/api/auth/roles')
      .set('Authorization', authorization([UserRole.ADMIN]))
      .send({ role: UserRole.CUSTOMER });
    expect(response.status).toBe(200);
    expect(response.body.user.roles).toContain(UserRole.ADMIN);
    const forbidden = await request(app)
      .post('/api/auth/roles')
      .set('Authorization', authorization([UserRole.ADMIN]))
      .send({ role: UserRole.ADMIN });
    expect(forbidden.status).toBe(400);
  });

  it('blocks suspended accounts', async () => {
    db.user.findUnique.mockResolvedValue({
      ...account,
      status: AccountStatus.SUSPENDED,
    });
    const response = await request(app)
      .post('/api/auth/roles')
      .set('Authorization', authorization())
      .send({ role: UserRole.STUDENT });
    expect(response.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'UNAUTHORIZED'],
    [{ ...account, status: AccountStatus.SUSPENDED }, 'ACCOUNT_NOT_ACTIVE'],
    [{ ...account, birthDate: null }, 'BIRTH_DATE_REQUIRED'],
  ])(
    'rechecks the account inside the transaction if it changed since authentication',
    async (current, code) => {
      db.user.findUnique
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(current);
      const response = await request(app)
        .post('/api/auth/roles')
        .set('Authorization', authorization())
        .send({ role: UserRole.STUDENT });
      expect(response.body.code).toBe(code);
      expect(response.status).toBe(code === 'UNAUTHORIZED' ? 401 : 403);
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(db.userRoleAssignment.createMany).not.toHaveBeenCalled();
    },
  );
});
