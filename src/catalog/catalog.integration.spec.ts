import { randomUUID } from 'node:crypto';
import { PricingType, ProfileStatus, UserRole } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { studentEducationsRouter } from '@/routes/student-educations.routes';
import { studentProfilesRouter } from '@/routes/student-profiles.routes';
import { studentSpecialtiesRouter } from '@/routes/student-specialties.routes';
import { studyFieldsRouter } from '@/routes/study-fields.routes';
import {
  lockStudentProfile,
  removeIneligibleSpecialties,
} from '@/services/student-specialties';
import { importCatalog, validateCatalog } from '../../prisma/catalog';

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
const catalog = validateCatalog({
  version: 2,
  domains: [
    { label: 'Test Web', specialties: ['Site vitrine', 'Application web'] },
    {
      label: 'Test Soutien',
      specialties: [
        'Maths primaire',
        'Maths college',
        'Physique-chimie',
        'Anglais',
      ],
    },
  ],
  studyFields: [
    {
      label: 'Test Developpement',
      allowedSpecialties: [{ domain: 'Test Web', specialty: 'Site vitrine' }],
    },
    {
      label: 'Test Mathematiques',
      allowedSpecialties: [
        { domain: 'Test Soutien', specialty: 'Maths primaire' },
      ],
    },
    {
      label: 'Test Physique',
      allowedSpecialties: [
        { domain: 'Test Soutien', specialty: 'Physique-chimie' },
      ],
    },
    { label: 'Test Marketing', allowedSpecialties: [] },
    {
      label: 'Test Langues',
      allowedSpecialties: [{ domain: 'Test Soutien', specialty: 'Anglais' }],
    },
    {
      label: 'Test Web secondaire',
      allowedSpecialties: [{ domain: 'Test Web', specialty: 'Site vitrine' }],
    },
  ],
});

databaseTests(
  'Catalog and eligibility with PostgreSQL (isolated test database)',
  () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      studyFieldsRouter,
      studentEducationsRouter,
      studentSpecialtiesRouter,
      studentProfilesRouter,
    );
    app.use(errorHandler);
    let studentId: string;
    let token: string;
    const domains = new Map<string, string>();
    const specialties = new Map<string, string>();
    const fields = new Map<string, string>();

    beforeAll(async () => {
      await importCatalog(prisma, catalog);
      for (const row of await prisma.domain.findMany())
        domains.set(row.label, row.id);
      for (const row of await prisma.specialty.findMany())
        specialties.set(row.label, row.id);
      for (const row of await prisma.studyField.findMany())
        fields.set(row.label, row.id);
    });

    beforeEach(async () => {
      studentId = randomUUID();
      await prisma.user.create({
        data: {
          id: studentId,
          roles: {
            create: [{ role: UserRole.STUDENT }, { role: UserRole.CUSTOMER }],
          },
          studentProfile: { create: { domainId: domains.get('Test Web')! } },
        },
      });
      token = jwt.sign(
        { sub: studentId, roles: [UserRole.STUDENT, UserRole.CUSTOMER] },
        config.jwtSecret,
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function education(field?: string) {
      return prisma.studentEducation.create({
        data: {
          studentId,
          title: 'Declared education',
          studyFieldId: field ? fields.get(field) : null,
        },
      });
    }

    function addSpecialty(label: string) {
      return request(app)
        .post('/api/student-specialties')
        .set('Authorization', `Bearer ${token}`)
        .send({
          specialtyId: specialties.get(label),
          pricingType: PricingType.HOURLY,
          priceCents: 2500,
        });
    }

    async function principalDomain(label: string) {
      await prisma.studentProfile.update({
        where: { userId: studentId },
        data: { domainId: domains.get(label)! },
      });
    }

    it('preserves historical data across the additive migration', async () => {
      const legacyId = '10000000-0000-4000-8000-000000000001';
      expect(
        await prisma.studentEducation.findUnique({
          where: { id: '10000000-0000-4000-8000-000000000005' },
        }),
      ).toMatchObject({
        studentId: legacyId,
        title: 'Legacy education',
        school: 'Legacy school',
        studyFieldId: null,
      });
      expect(
        await prisma.studentSpecialty.findFirst({
          where: { studentId: legacyId },
        }),
      ).toMatchObject({ priceCents: 1450, pricingType: PricingType.HOURLY });
      expect(
        await prisma.missionItem.findUnique({
          where: { id: '10000000-0000-4000-8000-000000000007' },
        }),
      ).toMatchObject({
        specialtyLabel: 'Contractual snapshot',
        unitPriceCents: 1450,
      });
    });

    it('replays the seed without duplicates or changed UUIDs, including existing normalized labels', async () => {
      const snapshot = async () => ({
        domains: await prisma.domain.findMany({
          select: { id: true, label: true },
          orderBy: { id: 'asc' },
        }),
        specialties: await prisma.specialty.findMany({
          select: { id: true, label: true, domainId: true },
          orderBy: { id: 'asc' },
        }),
        fields: await prisma.studyField.findMany({ orderBy: { id: 'asc' } }),
        links: await prisma.studyFieldSpecialty.findMany({
          orderBy: [{ studyFieldId: 'asc' }, { specialtyId: 'asc' }],
        }),
      });
      const before = await snapshot();
      await importCatalog(prisma, catalog);
      await importCatalog(
        prisma,
        validateCatalog({
          ...catalog,
          domains: catalog.domains.map((domain) => ({
            label: domain.label.toUpperCase(),
            specialties: domain.specialties.map((label) => label.toLowerCase()),
          })),
          studyFields: catalog.studyFields.map((field) => ({
            ...field,
            label: field.label.toLowerCase(),
          })),
        }),
      );
      expect(await snapshot()).toEqual(before);
    });

    it('lists official study fields publicly', async () => {
      const response = await request(app).get('/api/study-fields');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.arrayContaining([
          { id: fields.get('Test Developpement'), label: 'Test Developpement' },
        ]),
      );
    });

    it('allows Site vitrine for a linked developer and rejects an unlinked specialty in the same domain', async () => {
      await education('Test Developpement');
      expect((await addSpecialty('Site vitrine')).status).toBe(201);
      const rejected = await addSpecialty('Application web');
      expect(rejected.status).toBe(403);
      expect(rejected.body.code).toBe('SPECIALTY_NOT_ELIGIBLE');
    });

    it('rejects physics for a developer even with a compatible principal domain', async () => {
      await education('Test Developpement');
      await principalDomain('Test Soutien');
      expect((await addSpecialty('Physique-chimie')).status).toBe(403);
    });

    it('rejects English for marketing until a relevant second education is linked', async () => {
      await principalDomain('Test Soutien');
      await education('Test Marketing');
      expect((await addSpecialty('Anglais')).status).toBe(403);
      await education('Test Langues');
      expect((await addSpecialty('Anglais')).status).toBe(201);
    });

    it('opens only the precise mathematics specialty', async () => {
      await principalDomain('Test Soutien');
      await education('Test Mathematiques');
      expect((await addSpecialty('Maths primaire')).status).toBe(201);
      expect((await addSpecialty('Maths college')).status).toBe(403);
    });

    it('lists the exact union for two educations, without duplicates or opening a full domain', async () => {
      await principalDomain('Test Soutien');
      await education('Test Mathematiques');
      await education('Test Mathematiques');
      await education('Test Physique');
      const response = await request(app)
        .get('/api/student-specialties/eligible')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(
        response.body
          .map((specialty: { label: string }) => specialty.label)
          .sort(),
      ).toEqual(['Maths primaire', 'Physique-chimie']);
    });

    it('grants no specialties for an education with no study field or for no education', async () => {
      expect((await addSpecialty('Site vitrine')).status).toBe(403);
      await education();
      const response = await request(app)
        .get('/api/student-specialties/eligible')
        .set('Authorization', `Bearer ${token}`);
      expect(response.body).toEqual([]);
      expect((await addSpecialty('Site vitrine')).status).toBe(403);
    });

    it('rejects an eligible specialty outside the principal domain', async () => {
      await education('Test Mathematiques');
      const response = await addSpecialty('Maths primaire');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('SPECIALTY_DOMAIN_MISMATCH');
    });

    it('declares and reads education fields without allowing a supplied studentId to change ownership', async () => {
      const response = await request(app)
        .post('/api/student-educations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          studentId: randomUUID(),
          title: ' Licence informatique ',
          school: ' School ',
          level: 'BAC+3',
          startDate: '2025-09-01',
          studyFieldId: fields.get('Test Developpement'),
        });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        studentId,
        title: 'Licence informatique',
        school: 'School',
        level: 'BAC+3',
      });
      const list = await request(app)
        .get('/api/student-educations/me')
        .set('Authorization', `Bearer ${token}`);
      expect(list.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: response.body.id,
            studyFieldId: fields.get('Test Developpement'),
          }),
        ]),
      );
    });

    it('rejects unknown study fields and invalid dates', async () => {
      const unknown = await request(app)
        .post('/api/student-educations')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Education', studyFieldId: randomUUID() });
      expect(unknown.status).toBe(404);
      for (const dates of [
        { startDate: '2025-02-30' },
        { startDate: '2025-09-01', endDate: '2024-01-01' },
      ]) {
        const response = await request(app)
          .post('/api/student-educations')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: 'Education', ...dates });
        expect(response.status).toBe(400);
      }
      expect(
        await prisma.studentEducation.count({ where: { studentId } }),
      ).toBe(0);
    });

    it('removes ineligible offerings after education change and resets a visible profile to draft', async () => {
      const row = await education('Test Developpement');
      await addSpecialty('Site vitrine');
      await prisma.studentProfile.update({
        where: { userId: studentId },
        data: { status: ProfileStatus.VISIBLE },
      });
      const response = await request(app)
        .patch(`/api/student-educations/${row.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studyFieldId: fields.get('Test Marketing') });
      expect(response.status).toBe(200);
      expect(
        await prisma.studentSpecialty.count({ where: { studentId } }),
      ).toBe(0);
      expect(
        await prisma.studentProfile.findUnique({
          where: { userId: studentId },
        }),
      ).toMatchObject({ status: ProfileStatus.DRAFT });
    });

    it('keeps a specialty while another education still grants it', async () => {
      const first = await education('Test Developpement');
      await education('Test Web secondaire');
      await addSpecialty('Site vitrine');
      const response = await request(app)
        .delete(`/api/student-educations/${first.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(204);
      expect(
        await prisma.studentSpecialty.count({ where: { studentId } }),
      ).toBe(1);
    });

    it('preserves mission snapshots when deleting the last eligible education', async () => {
      const row = await education('Test Developpement');
      await addSpecialty('Site vitrine');
      const customer = await prisma.user.create({ data: {} });
      const mission = await prisma.mission.create({
        data: {
          customerUserId: customer.id,
          studentId,
          description: 'Historical contract',
          items: {
            create: {
              specialtyId: specialties.get('Site vitrine')!,
              specialtyLabel: 'Signed label',
              pricingType: PricingType.FIXED,
              unitPriceCents: 4000,
            },
          },
        },
        include: { items: true },
      });
      const response = await request(app)
        .delete(`/api/student-educations/${row.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(204);
      expect(
        await prisma.studentSpecialty.count({ where: { studentId } }),
      ).toBe(0);
      expect(
        await prisma.mission.findUnique({
          where: { id: mission.id },
          include: { items: true },
        }),
      ).toEqual(mission);
    });

    it('rejects another student education and customer-only access', async () => {
      const foreign = await prisma.studentEducation.findFirst({
        where: { studentId: '10000000-0000-4000-8000-000000000001' },
      });
      for (const method of ['patch', 'delete'] as const) {
        const response = await request(app)
          [method](`/api/student-educations/${foreign!.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ studyFieldId: fields.get('Test Developpement') });
        expect(response.status).toBe(404);
      }
      await prisma.userRoleAssignment.delete({
        where: { userId_role: { userId: studentId, role: UserRole.STUDENT } },
      });
      const response = await request(app)
        .get('/api/student-educations/me')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('serializes duplicate concurrent specialty creation', async () => {
      await education('Test Developpement');
      const responses = await Promise.all([
        addSpecialty('Site vitrine'),
        addSpecialty('Site vitrine'),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      expect(
        await prisma.studentSpecialty.count({ where: { studentId } }),
      ).toBe(1);
    });

    it('removes eligibility when an education is explicitly unlinked', async () => {
      const row = await education('Test Developpement');
      await addSpecialty('Site vitrine');
      const response = await request(app)
        .patch(`/api/student-educations/${row.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studyFieldId: null });
      expect(response.status).toBe(200);
      expect(response.body.studyFieldId).toBeNull();
      expect(
        await prisma.studentSpecialty.count({ where: { studentId } }),
      ).toBe(0);
    });

    it('keeps an education and its tariff when an unknown replacement study field is rejected', async () => {
      const row = await education('Test Developpement');
      await addSpecialty('Site vitrine');
      const response = await request(app)
        .patch(`/api/student-educations/${row.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ studyFieldId: randomUUID() });
      expect(response.status).toBe(404);
      expect(
        await prisma.studentEducation.findUnique({ where: { id: row.id } }),
      ).toEqual(row);
      expect(
        await prisma.studentSpecialty.findFirst({ where: { studentId } }),
      ).toMatchObject({ priceCents: 2500 });
    });

    it('validates date order against unchanged education dates during a partial update', async () => {
      const row = await prisma.studentEducation.create({
        data: {
          studentId,
          title: 'Education',
          startDate: new Date('2025-09-01'),
          endDate: new Date('2026-06-30'),
        },
      });
      const response = await request(app)
        .patch(`/api/student-educations/${row.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ startDate: '2027-09-01' });
      expect(response.status).toBe(400);
      expect(
        await prisma.studentEducation.findUnique({ where: { id: row.id } }),
      ).toEqual(row);
    });

    it('removes incompatible associations on principal domain change without changing historical missions', async () => {
      await education('Test Developpement');
      await addSpecialty('Site vitrine');
      const before = await prisma.missionItem.findMany({
        orderBy: { id: 'asc' },
      });
      const response = await request(app)
        .patch('/api/student-profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ domainId: domains.get('Test Soutien') });
      expect(response.status).toBe(200);
      expect(
        await prisma.studentSpecialty.count({ where: { studentId } }),
      ).toBe(0);
      expect(
        await prisma.missionItem.findMany({ orderBy: { id: 'asc' } }),
      ).toEqual(before);
    });

    it('imports an empty approved catalog without changing existing rows', async () => {
      const counts = async () =>
        Promise.all([
          prisma.domain.count(),
          prisma.specialty.count(),
          prisma.studyField.count(),
          prisma.studyFieldSpecialty.count(),
          prisma.studentEducation.count(),
          prisma.studentSpecialty.count(),
          prisma.missionItem.count(),
        ]);
      const before = await counts();
      await importCatalog(
        prisma,
        validateCatalog({ version: 2, domains: [], studyFields: [] }),
      );
      expect(await counts()).toEqual(before);
    });

    it('waits for a concurrent education removal before checking eligibility', async () => {
      const row = await education('Test Developpement');
      let signalLocked!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const removing = prisma.$transaction(
        async (tx) => {
          const profile = await lockStudentProfile(tx, studentId);
          await tx.studentEducation.delete({ where: { id: row.id } });
          await removeIneligibleSpecialties(tx, studentId, profile.domainId);
          signalLocked();
          await released;
        },
        { timeout: 10000 },
      );
      await locked;
      const adding = addSpecialty('Site vitrine').then((response) => response);
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
          const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query ILIKE '%student_profiles%FOR UPDATE%'
          ) AS waiting
        `;
          waiting = rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
      } finally {
        release();
        await removing;
      }
      expect((await adding).status).toBe(403);
      expect(
        await prisma.studentSpecialty.count({ where: { studentId } }),
      ).toBe(0);
    });
  },
);
