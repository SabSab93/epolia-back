import { randomUUID, scryptSync } from 'node:crypto';
import { AccountStatus, UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '@/app';
import { config } from '@/config/env';
import { prisma } from '@/prisma/client';
import {
  hasEligibleAdmin,
  recordConfirmedAdminBirthDate,
} from '@/services/admin-majority-transition';

jest.mock('@/prisma/client', () => {
  const { PrismaClient } =
    jest.requireActual<typeof import('@prisma/client')>('@prisma/client');
  return {
    prisma: new PrismaClient({
      datasourceUrl: process.env.CATALOG_TEST_DATABASE_URL,
    }),
  };
});

const databaseTests = process.env.CATALOG_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const legacyAdminId = '10000000-0000-4000-8000-000000000008';
const legacyUserId = '10000000-0000-4000-8000-000000000009';

function bearer(userId: string, roles: UserRole[] = [UserRole.ADMIN]) {
  return `Bearer ${jwt.sign({ sub: userId, roles }, config.jwtSecret)}`;
}

databaseTests(
  'Majority transition with PostgreSQL and pre-migration accounts',
  () => {
    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('keeps old tokens blocked until an operator records a confirmed adult date for an existing admin', async () => {
      const password = 'majority-test-password';
      const salt = 'majority-test-salt';
      await prisma.user.update({
        where: { id: legacyAdminId },
        data: {
          passwordHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
        },
      });
      expect(await hasEligibleAdmin(prisma)).toBe(false);
      const deniedLogin = await request(app).post('/api/auth/login').send({
        email: 'legacy-admin@test.invalid',
        password,
      });
      expect(deniedLogin.status).toBe(403);
      expect(deniedLogin.body.code).toBe('BIRTH_DATE_REQUIRED');
      const denied = await request(app)
        .get('/api/auth/me')
        .set('Authorization', bearer(legacyAdminId));
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('BIRTH_DATE_REQUIRED');
      await expect(
        recordConfirmedAdminBirthDate(prisma, {
          userId: legacyAdminId,
          birthDate: '2020-01-01',
        }),
      ).rejects.toMatchObject({ code: 'ADULT_REQUIRED' });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: legacyAdminId } }))
          .birthDate,
      ).toBeNull();

      // Synthetic historical fixture: a real operator must use an actually confirmed date.
      await recordConfirmedAdminBirthDate(prisma, {
        userId: legacyAdminId,
        birthDate: '2000-01-01',
      });
      expect(await hasEligibleAdmin(prisma)).toBe(true);
      const login = await request(app).post('/api/auth/login').send({
        email: 'legacy-admin@test.invalid',
        password,
      });
      expect(login.status).toBe(200);
      expect(login.body.user).not.toHaveProperty('birthDate');
      const allowed = await request(app)
        .get(`/api/users/${legacyUserId}`)
        .set('Authorization', bearer(legacyAdminId));
      expect(allowed.status).toBe(200);
      expect(allowed.body).not.toHaveProperty('birthDate');
      const managed = await prisma.user.findUniqueOrThrow({
        where: { id: legacyUserId },
      });
      expect(managed.birthDate).toBeNull();
      const stillDenied = await request(app)
        .get('/api/auth/me')
        .set('Authorization', bearer(legacyUserId, [UserRole.CUSTOMER]));
      expect(stillDenied.status).toBe(403);
      expect(stillDenied.body.code).toBe('BIRTH_DATE_REQUIRED');
    });

    it('suspends an undated historical account and persists its deletion request without guessing a date', async () => {
      const suspended = await request(app)
        .patch(`/api/users/${legacyUserId}/status`)
        .set('Authorization', bearer(legacyAdminId))
        .send({ status: AccountStatus.SUSPENDED });
      expect(suspended.status).toBe(200);
      const deletion = await request(app)
        .post(`/api/users/${legacyUserId}/deletion-request`)
        .set('Authorization', bearer(legacyAdminId))
        .send({});
      expect(deletion.status).toBe(200);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: legacyUserId },
      });
      expect(stored.status).toBe(AccountStatus.SUSPENDED);
      expect(stored.birthDate).toBeNull();
      expect(stored.deletionRequestedAt).toBeInstanceOf(Date);
      expect(
        await prisma.privacyRequest.count({ where: { userId: legacyUserId } }),
      ).toBe(1);
    });

    it('still rejects reactivation without a date through the API and direct database writes', async () => {
      const response = await request(app)
        .patch(`/api/users/${legacyUserId}/status`)
        .set('Authorization', bearer(legacyAdminId))
        .send({ status: AccountStatus.ACTIVE });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('BIRTH_DATE_REQUIRED');
      await expect(
        prisma.user.update({
          where: { id: legacyUserId },
          data: { status: AccountStatus.ACTIVE },
        }),
      ).rejects.toThrow();
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: legacyUserId } }))
          .status,
      ).toBe(AccountStatus.SUSPENDED);
    });

    it.each([AccountStatus.ACTIVE, AccountStatus.SUSPENDED])(
      'rejects new undated %s accounts at database level',
      async (status) => {
        await expect(
          prisma.user.create({ data: { id: randomUUID(), status } }),
        ).rejects.toThrow();
      },
    );

    it('does not erase known dates except when deleting, and does not reactivate undated deleted accounts', async () => {
      const user = await prisma.user.create({
        data: { birthDate: new Date('2000-01-01') },
      });
      await expect(
        prisma.user.update({
          where: { id: user.id },
          data: { birthDate: null },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.user.update({
          where: { id: user.id },
          data: { birthDate: null, status: AccountStatus.SUSPENDED },
        }),
      ).rejects.toThrow();
      await prisma.user.update({
        where: { id: user.id },
        data: { birthDate: null, status: AccountStatus.DELETED },
      });
      await expect(
        prisma.user.update({
          where: { id: user.id },
          data: { status: AccountStatus.ACTIVE },
        }),
      ).rejects.toThrow();
    });

    it('does not grant roles, reactivate accounts or overwrite recorded dates through the operator transition', async () => {
      const ordinary = await prisma.user.create({
        data: {
          birthDate: new Date('2000-01-01'),
          roles: { create: { role: UserRole.CUSTOMER } },
        },
      });
      const suspended = await prisma.user.create({
        data: {
          status: AccountStatus.SUSPENDED,
          birthDate: new Date('2000-01-01'),
          roles: { create: { role: UserRole.ADMIN } },
        },
      });
      for (const userId of [ordinary.id, suspended.id]) {
        await expect(
          recordConfirmedAdminBirthDate(prisma, {
            userId,
            birthDate: '2000-01-01',
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
      await recordConfirmedAdminBirthDate(prisma, {
        userId: legacyAdminId,
        birthDate: '2000-01-01',
      });
      await expect(
        recordConfirmedAdminBirthDate(prisma, {
          userId: legacyAdminId,
          birthDate: '1999-01-01',
        }),
      ).rejects.toMatchObject({ code: 'BIRTH_DATE_ALREADY_SET' });
      await expect(
        recordConfirmedAdminBirthDate(prisma, {
          userId: randomUUID(),
          birthDate: '2000-01-01',
        }),
      ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
      await expect(
        recordConfirmedAdminBirthDate(prisma, {
          userId: 'not-a-uuid',
          birthDate: '2000-01-01',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: suspended.id } }))
          .status,
      ).toBe(AccountStatus.SUSPENDED);
      expect(
        await prisma.userRoleAssignment.findMany({
          where: { userId: ordinary.id },
          select: { role: true },
        }),
      ).toEqual([{ role: UserRole.CUSTOMER }]);
    });

    it('still permits anonymization of an undated historical account', async () => {
      const response = await request(app)
        .post(`/api/users/${legacyUserId}/anonymize`)
        .set('Authorization', bearer(legacyAdminId))
        .send({});
      expect(response.status).toBe(200);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: legacyUserId },
      });
      expect(user.status).toBe(AccountStatus.DELETED);
      expect(user.birthDate).toBeNull();
      expect(user.email).toBeNull();
    });
  },
);
