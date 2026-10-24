import { randomUUID, scryptSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import {
  AccountStatus,
  PricingType,
  ProfileStatus,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
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
import { authRouter } from '@/routes/auth.routes';
import { usersRouter } from '@/routes/users.routes';
import {
  lockStudentProfile,
  removeIneligibleSpecialties,
} from '@/services/student-specialties';
import {
  importCatalog,
  validateCatalog,
  validateActiveCatalog,
  readActiveCatalog,
} from '@root/prisma/catalog';

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
      authRouter,
      studyFieldsRouter,
      studentEducationsRouter,
      studentSpecialtiesRouter,
      studentProfilesRouter,
      usersRouter,
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
      for (const row of await prisma.specialty.findMany({
        where: {
          domainId: {
            in: catalog.domains.map((domain) => domains.get(domain.label)!),
          },
        },
      }))
        specialties.set(row.label, row.id);
      for (const row of await prisma.studyField.findMany())
        fields.set(row.label, row.id);
    });

    beforeEach(async () => {
      studentId = randomUUID();
      await prisma.user.create({
        data: {
          id: studentId,
          birthDate: new Date('2000-01-01'),
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

    function today() {
      const now = new Date();
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    }

    function relativeDay(days: number) {
      const date = today();
      date.setUTCDate(date.getUTCDate() + days);
      return date;
    }

    async function education(
      field?: string,
      dates: { startDate: Date | null; endDate: Date | null } = {
        startDate: relativeDay(-30),
        endDate: relativeDay(30),
      },
    ) {
      return prisma.studentEducation.create({
        data: {
          studentId,
          title: 'Declared education',
          ...dates,
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

    it.each([
      ['past', -30, -1],
      ['future', 1, 30],
      ['missing dates', null, null],
      ['missing start', null, 30],
      ['missing end', -30, null],
    ] as const)(
      'grants no rights for %s education',
      async (_label, start, end) => {
        await education('Test Developpement', {
          startDate: start === null ? null : relativeDay(start),
          endDate: end === null ? null : relativeDay(end),
        });
        const list = await request(app)
          .get('/api/student-specialties/eligible')
          .set('Authorization', `Bearer ${token}`);
        expect(list.status).toBe(200);
        expect(list.body).toEqual([]);
        expect((await addSpecialty('Site vitrine')).status).toBe(403);
      },
    );

    it('accepts the start and end civil dates inclusively', async () => {
      await education('Test Developpement', {
        startDate: today(),
        endDate: today(),
      });
      const list = await request(app)
        .get('/api/student-specialties/eligible')
        .set('Authorization', `Bearer ${token}`);
      expect(list.body.map((row: { label: string }) => row.label)).toEqual([
        'Site vitrine',
      ]);
      expect((await addSpecialty('Site vitrine')).status).toBe(201);
    });

    async function visibleProfile() {
      await prisma.studentVerification.create({
        data: {
          studentId,
          status: VerificationStatus.APPROVED,
          schoolDocumentStorageKey: 'test-only-proof',
        },
      });
      await prisma.studentProfile.update({
        where: { userId: studentId },
        data: { status: ProfileStatus.VISIBLE },
      });
    }

    it.each([
      AccountStatus.ACTIVE,
      AccountStatus.SUSPENDED,
      AccountStatus.DELETED,
    ])(
      'checks account status in anonymous profile reads: %s',
      async (status) => {
        await education('Test Developpement');
        expect((await addSpecialty('Site vitrine')).status).toBe(201);
        await visibleProfile();
        await prisma.user.update({
          where: { id: studentId },
          data: { status },
        });
        const response = await request(app).get(
          `/api/users/${studentId}/student-profile`,
        );
        expect(response.status).toBe(
          status === AccountStatus.ACTIVE ? 200 : 404,
        );
        if (status !== AccountStatus.ACTIVE)
          expect(response.body.code).toBe('STUDENT_PROFILE_NOT_FOUND');
      },
    );

    it('expires rights at the next UTC date without an education PATCH', async () => {
      const end = today();
      const row = await education('Test Developpement', {
        startDate: relativeDay(-30),
        endDate: end,
      });
      expect((await addSpecialty('Site vitrine')).status).toBe(201);
      await visibleProfile();
      expect(
        (await request(app).get(`/api/users/${studentId}/student-profile`))
          .status,
      ).toBe(200);
      jest.useFakeTimers({
        doNotFake: [
          'hrtime',
          'performance',
          'nextTick',
          'queueMicrotask',
          'setImmediate',
          'clearImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
        ],
      });
      try {
        jest.setSystemTime(new Date(end.getTime() + 86400000));
        // Renew the session at the simulated date: test eligibility, not JWT expiry.
        token = jwt.sign(
          { sub: studentId, roles: [UserRole.STUDENT, UserRole.CUSTOMER] },
          config.jwtSecret,
        );
        const list = await request(app)
          .get('/api/student-specialties/eligible')
          .set('Authorization', `Bearer ${token}`);
        expect(list.status).toBe(200);
        expect(list.body).toEqual([]);
        const price = await request(app)
          .patch(`/api/student-specialties/${specialties.get('Site vitrine')}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ priceCents: 3000 });
        expect(price.status).toBe(403);
        expect(
          (await request(app).get(`/api/users/${studentId}/student-profile`))
            .status,
        ).toBe(404);
        expect(
          await prisma.studentEducation.findUnique({ where: { id: row.id } }),
        ).toEqual(row);
        expect(
          await prisma.studentSpecialty.findFirst({ where: { studentId } }),
        ).toMatchObject({ priceCents: 2500 });
      } finally {
        jest.useRealTimers();
      }
    });

    it('removes offerings after changing current education to future dates', async () => {
      const row = await education('Test Developpement');
      expect((await addSpecialty('Site vitrine')).status).toBe(201);
      await visibleProfile();
      const response = await request(app)
        .patch(`/api/student-educations/${row.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          startDate: relativeDay(1).toISOString().slice(0, 10),
          endDate: relativeDay(30).toISOString().slice(0, 10),
        });
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
      const customer = await prisma.user.create({
        data: { birthDate: new Date('2000-01-01') },
      });
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

    function activeCatalog() {
      const specialtyId = randomUUID();
      return validateActiveCatalog({
        version: 3,
        domains: [
          {
            id: randomUUID(),
            label: `V3 domain ${randomUUID()}`,
            specialties: [{ id: specialtyId, label: 'Initial specialty' }],
          },
        ],
        studyFields: [
          {
            id: randomUUID(),
            label: `V3 study field ${randomUUID()}`,
            allowedSpecialtyIds: [specialtyId],
          },
        ],
      });
    }

    async function catalogCounts() {
      return Promise.all([
        prisma.domain.count(),
        prisma.specialty.count(),
        prisma.studyField.count(),
        prisma.studyFieldSpecialty.count(),
        prisma.studentSpecialty.count(),
        prisma.missionItem.count(),
      ]);
    }

    it('previews an import without creating any rows, then imports and replays it', async () => {
      const input = activeCatalog();
      const before = await catalogCounts();
      const preview = await importCatalog(prisma, input, { dryRun: true });
      expect(preview.conflicts).toEqual([]);
      expect(preview.changes.map((change) => change.action)).toEqual([
        'create',
        'create',
        'create',
      ]);
      expect(preview.links[0].action).toBe('create');
      expect(await catalogCounts()).toEqual(before);
      await importCatalog(prisma, input);
      const imported = await catalogCounts();
      const replay = await importCatalog(prisma, input);
      expect(
        replay.changes.every((change) => change.action === 'unchanged'),
      ).toBe(true);
      expect(
        replay.links.every((change) => change.action === 'unchanged'),
      ).toBe(true);
      expect(await catalogCounts()).toEqual(imported);
    });

    it('renames entries without losing profile, education, offer, eligibility or mission references', async () => {
      const input = activeCatalog();
      await importCatalog(prisma, input);
      const domain = input.domains[0];
      const specialty = domain.specialties[0];
      const field = input.studyFields[0];
      await prisma.studentProfile.update({
        where: { userId: studentId },
        data: { domainId: domain.id },
      });
      const education = await prisma.studentEducation.create({
        data: {
          studentId,
          title: 'Current education',
          studyFieldId: field.id,
          startDate: relativeDay(-30),
          endDate: relativeDay(30),
        },
      });
      const offer = await request(app)
        .post('/api/student-specialties')
        .set('Authorization', `Bearer ${token}`)
        .send({
          specialtyId: specialty.id,
          pricingType: 'HOURLY',
          priceCents: 2500,
        });
      expect(offer.status).toBe(201);
      const customer = await prisma.user.create({
        data: { birthDate: new Date('2000-01-01') },
      });
      const mission = await prisma.mission.create({
        data: {
          customerUserId: customer.id,
          studentId,
          description: 'Contract before rename',
          items: {
            create: {
              specialtyId: specialty.id,
              specialtyLabel: specialty.label,
              pricingType: 'HOURLY',
              unitPriceCents: 2500,
            },
          },
        },
        include: { items: true },
      });
      const counts = await catalogCounts();
      const renamed = structuredClone(input);
      renamed.domains[0].label += ' renamed';
      renamed.domains[0].specialties[0].label = 'Renamed specialty';
      renamed.studyFields[0].label += ' renamed';
      const preview = await importCatalog(prisma, renamed, { dryRun: true });
      expect(
        preview.changes.every((change) => change.action === 'rename'),
      ).toBe(true);
      expect(
        await prisma.specialty.findUnique({ where: { id: specialty.id } }),
      ).toMatchObject({ label: specialty.label });
      await importCatalog(prisma, renamed);
      expect(await catalogCounts()).toEqual(counts);
      expect(
        await prisma.studentProfile.findUnique({
          where: { userId: studentId },
        }),
      ).toMatchObject({ domainId: domain.id });
      expect(
        await prisma.studentEducation.findUnique({
          where: { id: education.id },
        }),
      ).toEqual(education);
      expect(
        await prisma.studentSpecialty.findFirst({ where: { studentId } }),
      ).toMatchObject({ specialtyId: specialty.id, priceCents: 2500 });
      expect(
        await prisma.mission.findUnique({
          where: { id: mission.id },
          include: { items: true },
        }),
      ).toEqual(mission);
      const eligible = await request(app)
        .get('/api/student-specialties/eligible')
        .set('Authorization', `Bearer ${token}`);
      expect(eligible.status).toBe(200);
      expect(eligible.body).toEqual([
        expect.objectContaining({
          id: specialty.id,
          label: 'Renamed specialty',
        }),
      ]);
    });

    it('reports conflicting identities without changing existing UUIDs or writing partial data', async () => {
      const input = activeCatalog();
      await importCatalog(prisma, input);
      const conflicting = structuredClone(input);
      conflicting.domains[0].id = randomUUID();
      const before = await catalogCounts();
      const preview = await importCatalog(prisma, conflicting, {
        dryRun: true,
      });
      expect(preview.conflicts.join(' ')).toContain(input.domains[0].id);
      await expect(importCatalog(prisma, conflicting)).rejects.toThrow(
        /conflicts/,
      );
      expect(await catalogCounts()).toEqual(before);
      expect(
        await prisma.domain.findUnique({ where: { id: input.domains[0].id } }),
      ).not.toBeNull();
    });

    it('does not implicitly move an existing specialty to another domain', async () => {
      const input = activeCatalog();
      await importCatalog(prisma, input);
      const moved = structuredClone(input);
      moved.domains[0].id = randomUUID();
      moved.domains[0].label += ' other';
      await expect(importCatalog(prisma, moved)).rejects.toThrow(
        /domain changes/,
      );
      expect(
        await prisma.domain.findUnique({ where: { id: moved.domains[0].id } }),
      ).toBeNull();
    });

    it('preserves omitted entries and links rather than treating a file change as revocation', async () => {
      const input = activeCatalog();
      await importCatalog(prisma, input);
      const before = await catalogCounts();
      const removed = structuredClone(input);
      removed.studyFields[0].allowedSpecialtyIds = [];
      await importCatalog(prisma, removed);
      await importCatalog(prisma, { version: 3, domains: [], studyFields: [] });
      expect(await catalogCounts()).toEqual(before);
    });

    it('rolls back earlier writes if creating a correspondence fails', async () => {
      const input = activeCatalog();
      const failing = prisma.$extends({
        query: {
          studyFieldSpecialty: {
            create() {
              throw new Error('Simulated correspondence failure');
            },
          },
        },
      });
      const before = await catalogCounts();
      await expect(
        importCatalog(failing as unknown as typeof prisma, input),
      ).rejects.toThrow('Simulated correspondence failure');
      expect(await catalogCounts()).toEqual(before);
    });

    it('imports the corrected full catalog and exposes only same-domain approved math specialties', async () => {
      const input = readActiveCatalog(
        join(__dirname, '../../prisma/catalog/approved.json'),
      );
      const preview = await importCatalog(prisma, input, { dryRun: true });
      expect(preview.conflicts).toEqual([]);
      const count = input.domains.reduce(
        (sum, domain) => sum + domain.specialties.length + 1,
        input.studyFields.length,
      );
      expect(preview.changes).toHaveLength(count);
      expect(preview.links).toHaveLength(
        input.studyFields.reduce(
          (sum, field) => sum + field.allowedSpecialtyIds.length,
          0,
        ),
      );
      await importCatalog(prisma, input);
      const field = input.studyFields.find(
        (field) => field.label === 'Mathématiques et statistiques',
      )!;
      const domain = input.domains.find(
        (domain) => domain.label === 'Soutien scolaire lycée et supérieur',
      )!;
      await prisma.studentProfile.update({
        where: { userId: studentId },
        data: { domainId: domain.id },
      });
      await prisma.studentEducation.create({
        data: {
          studentId,
          title: 'Mathématiques',
          studyFieldId: field.id,
          startDate: relativeDay(-30),
          endDate: relativeDay(30),
        },
      });
      const list = await request(app)
        .get('/api/student-specialties/eligible')
        .set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(200);
      expect(
        list.body.map((row: { label: string }) => row.label).sort(),
      ).toEqual(['Mathématiques lycée', 'Statistiques']);
      const replay = await importCatalog(prisma, input);
      expect(
        replay.changes.every((change) => change.action === 'unchanged'),
      ).toBe(true);
      expect(
        replay.links.every((change) => change.action === 'unchanged'),
      ).toBe(true);
    });

    it('reports new study-field specialty links in the CLI dry-run without writing them', async () => {
      const input = readActiveCatalog(
        join(__dirname, '../../prisma/catalog/approved.json'),
      );
      await importCatalog(prisma, input);
      const field = input.studyFields.find(
        (field) => field.allowedSpecialtyIds.length > 0,
      )!;
      const specialtyId = field.allowedSpecialtyIds[0];
      const specialty = input.domains
        .flatMap((domain) => domain.specialties)
        .find((specialty) => specialty.id === specialtyId)!;
      const key = { studyFieldId: field.id, specialtyId };
      const run = promisify(execFile);
      async function preview() {
        const { stdout } = await run(
          process.execPath,
          [
            '-r',
            'ts-node/register',
            '-r',
            'tsconfig-paths/register',
            'prisma/seed-catalog.ts',
            '--dry-run',
          ],
          {
            cwd: join(__dirname, '../..'),
            env: {
              ...process.env,
              DATABASE_URL: process.env.CATALOG_TEST_DATABASE_URL,
              DIRECT_URL: process.env.CATALOG_TEST_DATABASE_URL,
            },
          },
        );
        return JSON.parse(stdout);
      }
      await prisma.studyFieldSpecialty.delete({
        where: { studyFieldId_specialtyId: key },
      });
      try {
        const before = await catalogCounts();
        const report = await preview();
        expect(report.dryRun).toBe(true);
        expect(report.entries).toEqual({
          created: 0,
          renamed: 0,
          unchanged: input.domains.reduce(
            (count, domain) => count + 1 + domain.specialties.length,
            input.studyFields.length,
          ),
        });
        expect(report.changes).toEqual([]);
        expect(report.links.created).toBe(1);
        expect(report.createdLinks).toEqual([
          {
            ...key,
            studyFieldLabel: field.label,
            specialtyLabel: specialty.label,
          },
        ]);
        expect(report.conflicts).toEqual([]);
        expect(await catalogCounts()).toEqual(before);
        expect(
          await prisma.studyFieldSpecialty.findUnique({
            where: { studyFieldId_specialtyId: key },
          }),
        ).toBeNull();
      } finally {
        await prisma.studyFieldSpecialty.upsert({
          where: { studyFieldId_specialtyId: key },
          create: key,
          update: {},
        });
      }
      const before = await catalogCounts();
      const replay = await preview();
      expect(replay.createdLinks).toEqual([]);
      expect(replay.links.created).toBe(0);
      expect(replay.links.unchanged).toBe(
        input.studyFields.reduce(
          (count, field) => count + field.allowedSpecialtyIds.length,
          0,
        ),
      );
      expect(await catalogCounts()).toEqual(before);
    }, 20000);

    it('preserves null historical dates but rejects public registration without a birth date', async () => {
      const legacy = await prisma.user.findUnique({
        where: { id: '10000000-0000-4000-8000-000000000001' },
      });
      expect(legacy?.birthDate).toBeNull();
      const email = `${randomUUID()}@test.invalid`;
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email, password: 'password123' });
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
            .send({ email, password: 'password123', birthDate, role });
          expect([400, 403]).toContain(response.status);
          expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
        }
        const registered = await request(app).post('/api/auth/register').send({
          email,
          password: 'password123',
          birthDate: '2000-01-01',
          role,
        });
        expect(registered.status).toBe(201);
        expect(registered.body.user.roles).toEqual([role]);
        expect(registered.body.user).not.toHaveProperty('birthDate');
        expect(
          jwt.verify(registered.body.accessToken, config.jwtSecret),
        ).not.toHaveProperty('birthDate');
        expect(
          (await prisma.user.findUnique({ where: { email } }))?.birthDate,
        ).toEqual(new Date('2000-01-01'));
        const me = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${registered.body.accessToken}`);
        expect(me.status).toBe(200);
        expect(me.body).not.toHaveProperty('birthDate');
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
  },
);
