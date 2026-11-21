import { randomUUID, scryptSync } from 'node:crypto';
import { AccountStatus, UserRole } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { errorHandler } from '@/middlewares/error.middleware';
import { usersRouter } from '@/modules/admin-users/users.routes';
import { authRouter } from '@/modules/auth/auth.routes';
import { userProfilesRouter } from '@/modules/profiles/user-profiles.routes';
import { studentProfilesRouter } from '@/modules/students/student-profiles.routes';
import { prisma } from '@/prisma/client';

jest.mock('@/prisma/client', () =>
  jest.requireActual('@root/tests/integration/test-database'),
);

const registrationTermsVersion = 'terms-test-v1';
const testRegistration = {
  password: 'password123',
  firstName: 'Camille',
  lastName: 'Dupont',
  termsAccepted: true,
  termsVersion: registrationTermsVersion,
};

const databaseTests = process.env.CATALOG_TEST_DATABASE_URL
  ? describe
  : describe.skip;
databaseTests('Accounts and roles with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    authRouter,
    studentProfilesRouter,
    userProfilesRouter,
    usersRouter,
  );
  app.use(errorHandler);
  let domainId: string;

  beforeAll(async () => {
    jest.replaceProperty(
      config,
      'registrationTermsVersion',
      registrationTermsVersion,
    );
    const domain = await prisma.domain.create({
      data: { label: 'Account test ' + randomUUID() },
    });
    domainId = domain.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma.$disconnect();
  });

  it('preserves null historical dates but rejects public registration without a birth date', async () => {
    const legacy = await prisma.user.findUnique({
      where: { id: '10000000-0000-4000-8000-000000000001' },
    });
    expect(legacy?.birthDate).toBeNull();
    const email = `${randomUUID()}@test.invalid`;
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...testRegistration, email });
    expect(response.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it.each([UserRole.CUSTOMER, UserRole.STUDENT])(
    'enforces majority and birth-date privacy on real registration: %s',
    async (role) => {
      const email = `${randomUUID()}@test.invalid`;
      for (const birthDate of [
        undefined,
        '2099-01-01',
        '2001-02-29',
        '2020-01-01',
      ]) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ ...testRegistration, email, birthDate, role });
        expect([400, 403]).toContain(response.status);
        expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      }
      const registered = await request(app)
        .post('/api/auth/register')
        .send({
          ...testRegistration,
          email,
          birthDate: '2000-01-01',
          role,
        });
      expect(registered.status).toBe(201);
      expect(registered.body.user.roles).toEqual([role]);
      expect(registered.body.user).not.toHaveProperty('birthDate');
      expect(
        jwt.verify(registered.body.accessToken, config.jwtSecret),
      ).not.toHaveProperty('birthDate');
      const account = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { profile: true, consents: true },
      });
      expect(account.birthDate).toEqual(new Date('2000-01-01'));
      expect(account.profile).toMatchObject({
        firstName: testRegistration.firstName,
        lastName: testRegistration.lastName,
      });
      expect(account.consents).toEqual([
        expect.objectContaining({
          consentType: 'TERMS_OF_USE',
          consentVersion: registrationTermsVersion,
          granted: true,
          createdAt: expect.any(Date),
        }),
      ]);
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${registered.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body).not.toHaveProperty('birthDate');
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email, password: testRegistration.password });
      expect(login.status).toBe(200);
      const authorization = `Bearer ${login.body.accessToken}`;
      const acceptance = await request(app)
        .get('/api/auth/terms-acceptance')
        .set('Authorization', authorization);
      expect(acceptance.status).toBe(200);
      expect(acceptance.body).toEqual({
        version: registrationTermsVersion,
        acceptedAt: account.consents[0]?.createdAt.toISOString(),
      });
      const profile = await request(app)
        .get('/api/user-profiles/me')
        .set('Authorization', authorization);
      expect(profile.status).toBe(200);
      expect(profile.body).toMatchObject({
        firstName: testRegistration.firstName,
        lastName: testRegistration.lastName,
      });
    },
  );
  it('records only one account, profile and acceptance for concurrent registration attempts', async () => {
    const email = `${randomUUID()}@test.invalid`;
    const input = { ...testRegistration, email, birthDate: '2000-01-01' };
    const attempts = await Promise.all(
      [input, input].map((body) =>
        request(app).post('/api/auth/register').send(body),
      ),
    );

    expect(attempts.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const account = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { profile: true, consents: true, roles: true },
    });
    expect(account.profile?.firstName).toBe(testRegistration.firstName);
    expect(account.roles).toHaveLength(1);
    expect(account.consents).toHaveLength(1);
  });

  it('rolls back registration when PostgreSQL rejects the terms acceptance', async () => {
    const email = `${randomUUID()}@test.invalid`;
    const termsVersion = 'terms-rollback-test';
    const registrationCounts = () =>
      Promise.all([
        prisma.user.count(),
        prisma.userRoleAssignment.count(),
        prisma.userProfile.count(),
        prisma.userConsent.count(),
      ]);

    const countsBefore = await registrationCounts();
    // Reject only the consent created by this test in the isolated database.
    await prisma.$executeRaw`
        ALTER TABLE user_consents ADD CONSTRAINT reject_rollback_test_consent
        CHECK (consent_version <> 'terms-rollback-test')
      `;
    try {
      jest.replaceProperty(config, 'registrationTermsVersion', termsVersion);
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...testRegistration,
          email,
          birthDate: '2000-01-01',
          termsVersion,
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
      expect(await registrationCounts()).toEqual(countsBefore);
    } finally {
      jest.replaceProperty(
        config,
        'registrationTermsVersion',
        registrationTermsVersion,
      );
      await prisma.$executeRaw`
          ALTER TABLE user_consents DROP CONSTRAINT reject_rollback_test_consent
        `;
    }
  });

  async function registerForRoleActivation(role: UserRole) {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({
        ...testRegistration,
        email: `${randomUUID()}@test.invalid`,
        birthDate: '2000-01-01',
        role,
      });
    expect(registered.status).toBe(201);
    return registered;
  }

  it.each([
    [UserRole.CUSTOMER, UserRole.STUDENT],
    [UserRole.STUDENT, UserRole.CUSTOMER],
  ])(
    'persists role activation %s -> %s without replacing account or profile data',
    async (initial, added) => {
      const registered = await registerForRoleActivation(initial);
      const userId: string = registered.body.user.id;
      const common = await prisma.userProfile.update({
        where: { userId },
        data: { city: 'Test' },
      });
      const student =
        initial === UserRole.STUDENT
          ? await prisma.studentProfile.create({
              data: { userId, domainId: domainId },
            })
          : null;
      const accountBefore = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const countBefore = await prisma.user.count();
      const response = await request(app)
        .post('/api/auth/roles')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .send({ role: added });
      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(userId);
      expect(response.body.user.roles).toEqual(
        expect.arrayContaining([initial, added]),
      );
      expect(response.body.user.roles).toHaveLength(2);
      const jwtPayload = jwt.verify(
        response.body.accessToken,
        config.jwtSecret,
      ) as jwt.JwtPayload;
      expect(jwtPayload.sub).toBe(userId);
      expect(jwtPayload.roles).toEqual(response.body.user.roles);
      expect(jwtPayload).not.toHaveProperty('birthDate');
      expect(response.body.user).not.toHaveProperty('birthDate');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(await prisma.user.count()).toBe(countBefore);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      ).toEqual(accountBefore);
      expect(
        await prisma.userProfile.findUnique({ where: { userId } }),
      ).toEqual(common);
      expect(
        await prisma.studentProfile.findUnique({ where: { userId } }),
      ).toEqual(student);
      expect(
        await prisma.studentVerification.count({
          where: { studentId: userId },
        }),
      ).toBe(0);
      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${registered.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.roles).toEqual(expect.arrayContaining([initial, added]));
      const publicProfile = await request(app).get(
        `/api/users/${userId}/student-profile`,
      );
      expect(publicProfile.status).toBe(404);
    },
  );

  it('handles concurrent and repeated activations without duplicate roles', async () => {
    const registered = await registerForRoleActivation(UserRole.CUSTOMER);
    const userId: string = registered.body.user.id;
    const activate = () =>
      request(app)
        .post('/api/auth/roles')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .send({ role: UserRole.STUDENT });
    const concurrent = await Promise.all(Array.from({ length: 4 }, activate));
    expect(concurrent.map((response) => response.status)).toEqual([
      200, 200, 200, 200,
    ]);
    const repeated = await activate();
    expect(repeated.status).toBe(200);
    expect(
      await prisma.userRoleAssignment.findMany({
        where: { userId },
        orderBy: { role: 'asc' },
        select: { role: true },
      }),
    ).toEqual([{ role: UserRole.STUDENT }, { role: UserRole.CUSTOMER }]);
    expect(repeated.body.user.roles).toHaveLength(2);
  });

  it('refuses self-assignment of ADMIN and leaves stored roles unchanged', async () => {
    const registered = await registerForRoleActivation(UserRole.CUSTOMER);
    const userId: string = registered.body.user.id;
    const response = await request(app)
      .post('/api/auth/roles')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .send({ role: UserRole.ADMIN });
    expect(response.status).toBe(400);
    expect(
      await prisma.userRoleAssignment.findMany({
        where: { userId },
        select: { role: true },
      }),
    ).toEqual([{ role: UserRole.CUSTOMER }]);
  });

  it.each([
    {
      status: AccountStatus.ACTIVE,
      birthDate: null,
      code: 'BIRTH_DATE_REQUIRED',
    },
    {
      status: AccountStatus.ACTIVE,
      birthDate: new Date('2020-01-01'),
      code: 'ADULT_REQUIRED',
    },
    {
      status: AccountStatus.SUSPENDED,
      birthDate: new Date('2000-01-01'),
      code: 'ACCOUNT_NOT_ACTIVE',
    },
    {
      status: AccountStatus.DELETED,
      birthDate: null,
      code: 'ACCOUNT_NOT_ACTIVE',
    },
  ])(
    'rejects an ineligible role activation without a database mutation: $code ($status)',
    async ({ status, birthDate, code }) => {
      // Synthetic persisted states; ordinary registration cannot create these accounts.
      const user = await prisma.user.create({
        data: {
          status,
          birthDate,
          roles: { create: { role: UserRole.CUSTOMER } },
        },
      });
      const token = jwt.sign(
        { sub: user.id, roles: [UserRole.CUSTOMER] },
        config.jwtSecret,
      );
      const response = await request(app)
        .post('/api/auth/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: UserRole.STUDENT });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe(code);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      ).toEqual(user);
      expect(
        await prisma.userRoleAssignment.findMany({
          where: { userId: user.id },
          select: { role: true },
        }),
      ).toEqual([{ role: UserRole.CUSTOMER }]);
    },
  );

  it('allows undated administrators to log in and manage historical accounts without an age transition', async () => {
    const password = 'admin-integration-test';
    const salt = 'admin-integration-salt';
    const admin = await prisma.user.create({
      data: {
        email: `${randomUUID()}@test.invalid`,
        passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
        roles: { create: { role: UserRole.ADMIN } },
      },
    });
    expect(admin.birthDate).toBeNull();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password });
    expect(login.status).toBe(200);
    const authorization = `Bearer ${login.body.accessToken}`;
    const legacyId = '10000000-0000-4000-8000-000000000002';
    const suspended = await request(app)
      .patch(`/api/users/${legacyId}/status`)
      .set('Authorization', authorization)
      .send({ status: AccountStatus.SUSPENDED });
    expect(suspended.status).toBe(200);
    const deletion = await request(app)
      .post(`/api/users/${legacyId}/deletion-request`)
      .set('Authorization', authorization)
      .send({});
    expect(deletion.status).toBe(200);
    expect(
      await prisma.privacyRequest.count({ where: { userId: legacyId } }),
    ).toBe(1);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: legacyId } }))
        .birthDate,
    ).toBeNull();
    const reactivated = await request(app)
      .patch(`/api/users/${legacyId}/status`)
      .set('Authorization', authorization)
      .send({ status: AccountStatus.ACTIVE });
    expect(reactivated.status).toBe(403);
    expect(reactivated.body.code).toBe('BIRTH_DATE_REQUIRED');
  });
});
