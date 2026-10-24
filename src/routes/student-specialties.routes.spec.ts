import {
  AccountStatus,
  PricingType,
  Prisma,
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
import { studentSpecialtiesRouter } from '@/routes/student-specialties.routes';

jest.mock('@/prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    studentProfile: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    studentEducation: { findFirst: jest.fn() },
    specialty: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    studentSpecialty: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
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
  email: 'student@example.com',
  status: AccountStatus.ACTIVE,
  roles: [
    {
      role: UserRole.STUDENT,
    },
  ],
};

const domainId = '9324c24d-a476-41db-a0e3-12479bd81ed7';
const otherDomainId = '2d7a69bc-bcfe-47bb-b0bf-e23fcb1553e3';
const specialtyId = '472e5d8d-e7bf-4513-a812-7970ecb65e9c';

const profileMock = {
  userId: userMock.id,
  domainId,
  title: 'Developpeuse web',
  description: null,
  status: ProfileStatus.DRAFT,
};

const specialtyMock = {
  id: specialtyId,
  domainId,
  label: 'Application web',
};

const studentSpecialtyMock = {
  studentId: userMock.id,
  specialtyId,
  pricingType: PricingType.HOURLY,
  priceCents: 2500,
  pricingDetails: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  specialty: {
    ...specialtyMock,
    domain: {
      id: domainId,
      label: 'Developpement web',
    },
  },
};

type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  user: {
    findUnique: SingleArgMock;
  };
  studentProfile: {
    findUnique: SingleArgMock;
    updateMany: SingleArgMock;
  };
  studentEducation: { findFirst: SingleArgMock };
  specialty: {
    findUnique: SingleArgMock;
    findMany: SingleArgMock;
  };
  studentSpecialty: {
    findMany: SingleArgMock;
    findUnique: SingleArgMock;
    create: SingleArgMock;
    update: SingleArgMock;
    deleteMany: SingleArgMock;
  };
  $transaction: jest.Mock<
    Promise<unknown>,
    [(tx: PrismaMock) => Promise<unknown>]
  >;
  $queryRaw: jest.Mock;
};

const prismaMock = prisma as unknown as PrismaMock;

function createAccessToken(roles: UserRole[] = [UserRole.STUDENT]) {
  return jwt.sign(
    {
      sub: userMock.id,
      email: userMock.email,
      roles,
    },
    config.jwtSecret,
  );
}

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api', studentSpecialtiesRouter);
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

function prismaKnownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Prisma error', {
    code,
    clientVersion: 'test',
  });
}

describe('Student specialty routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(userMock);
    prismaMock.studentProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.studentEducation.findFirst.mockResolvedValue({
      id: 'education-id',
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
  });

  it('returns the authenticated student specialties', async () => {
    prismaMock.studentSpecialty.findMany.mockResolvedValue([
      studentSpecialtyMock,
    ]);

    const response = await request(createTestApp())
      .get('/api/student-specialties/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject([
      {
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 2500,
      },
    ]);
    expect(prismaMock.studentSpecialty.findMany).toHaveBeenCalledWith({
      where: {
        studentId: userMock.id,
      },
      select: expect.any(Object),
      orderBy: {
        specialty: {
          label: 'asc',
        },
      },
    });
  });

  it('creates a student specialty for the selected domain', async () => {
    prismaMock.specialty.findUnique.mockResolvedValue(specialtyMock);
    prismaMock.studentSpecialty.create.mockResolvedValue(studentSpecialtyMock);

    const response = await request(createTestApp())
      .post('/api/student-specialties')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 2500,
        pricingDetails: 'Cours de 60 minutes',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      specialtyId,
      pricingType: PricingType.HOURLY,
      priceCents: 2500,
    });
    expect(firstCallArg(prismaMock.studentSpecialty.create)).toMatchObject({
      data: {
        studentId: userMock.id,
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 2500,
        pricingDetails: 'Cours de 60 minutes',
      },
    });
  });

  it('rejects a specialty from another domain', async () => {
    prismaMock.specialty.findUnique.mockResolvedValue({
      ...specialtyMock,
      domainId: otherDomainId,
    });

    const response = await request(createTestApp())
      .post('/api/student-specialties')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 2500,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'SPECIALTY_DOMAIN_MISMATCH',
      message: 'Specialty does not belong to the selected domain',
    });
    expect(prismaMock.studentSpecialty.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate student specialty', async () => {
    prismaMock.specialty.findUnique.mockResolvedValue(specialtyMock);
    prismaMock.studentSpecialty.create.mockRejectedValue(
      prismaKnownError('P2002'),
    );

    const response = await request(createTestApp())
      .post('/api/student-specialties')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 2500,
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      status: 409,
      code: 'STUDENT_SPECIALTY_ALREADY_EXISTS',
      message: 'Student specialty already exists',
    });
  });

  it('rejects non-positive prices', async () => {
    const response = await request(createTestApp())
      .post('/api/student-specialties')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 0,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'priceCents must be a positive integer',
    });
  });

  it('rejects decimal prices in cents', async () => {
    const response = await request(createTestApp())
      .post('/api/student-specialties')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 25.5,
      });

    expect(response.status).toBe(400);
  });

  it('rejects an unknown pricing type', async () => {
    const response = await request(createTestApp())
      .post('/api/student-specialties')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        specialtyId,
        pricingType: 'DAILY',
        priceCents: 2500,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'pricingType is invalid',
    });
  });

  it('updates pricing for an existing student specialty', async () => {
    prismaMock.studentSpecialty.findUnique.mockResolvedValue({
      specialty: {
        domainId,
      },
    });
    prismaMock.studentSpecialty.update.mockResolvedValue({
      ...studentSpecialtyMock,
      pricingType: PricingType.FIXED,
      priceCents: 12000,
      pricingDetails: 'Forfait',
    });

    const response = await request(createTestApp())
      .patch(`/api/student-specialties/${specialtyId}`)
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        pricingType: PricingType.FIXED,
        priceCents: 12000,
        pricingDetails: ' Forfait ',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      pricingType: PricingType.FIXED,
      priceCents: 12000,
      pricingDetails: 'Forfait',
    });
    expect(firstCallArg(prismaMock.studentSpecialty.update)).toMatchObject({
      data: {
        pricingType: PricingType.FIXED,
        priceCents: 12000,
        pricingDetails: 'Forfait',
      },
    });
  });

  it('deletes a student specialty association', async () => {
    prismaMock.studentSpecialty.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(createTestApp())
      .delete(`/api/student-specialties/${specialtyId}`)
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(204);
    expect(prismaMock.studentSpecialty.deleteMany).toHaveBeenCalledWith({
      where: {
        studentId: userMock.id,
        specialtyId,
      },
    });
  });

  it('rejects users without the student role', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      roles: [
        {
          role: UserRole.CUSTOMER,
        },
      ],
    });

    const response = await request(createTestApp())
      .get('/api/student-specialties/me')
      .set('Authorization', `Bearer ${createAccessToken([UserRole.CUSTOMER])}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
  });

  it.each(['Physique-chimie college', 'Anglais conversation'])(
    'rejects an unlinked specialty through a direct POST: %s',
    async (label) => {
      prismaMock.specialty.findUnique.mockResolvedValue({
        ...specialtyMock,
        label,
      });
      prismaMock.studentEducation.findFirst.mockResolvedValue(null);
      const response = await request(createTestApp())
        .post('/api/student-specialties')
        .set('Authorization', `Bearer ${createAccessToken()}`)
        .send({
          specialtyId,
          pricingType: PricingType.HOURLY,
          priceCents: 2500,
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('SPECIALTY_NOT_ELIGIBLE');
      expect(prismaMock.studentSpecialty.create).not.toHaveBeenCalled();
    },
  );

  it('rejects pricing updates when the education is no longer eligible', async () => {
    prismaMock.studentSpecialty.findUnique.mockResolvedValue({
      specialty: { domainId },
    });
    prismaMock.studentEducation.findFirst.mockResolvedValue(null);
    const response = await request(createTestApp())
      .patch(`/api/student-specialties/${specialtyId}`)
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({ priceCents: 3000 });

    expect(response.status).toBe(403);
    expect(prismaMock.studentSpecialty.update).not.toHaveBeenCalled();
  });

  it('lists eligible specialties for the principal domain', async () => {
    prismaMock.specialty.findMany.mockResolvedValue([specialtyMock]);
    const response = await request(createTestApp())
      .get('/api/student-specialties/eligible')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([specialtyMock]);
    expect(firstCallArg(prismaMock.specialty.findMany)).toMatchObject({
      where: {
        domainId,
        studyFields: {
          some: {
            studyField: { educations: { some: { studentId: userMock.id } } },
          },
        },
      },
    });
  });

  it('requires authentication', async () => {
    const response = await request(createTestApp()).get(
      '/api/student-specialties/eligible',
    );
    expect(response.status).toBe(401);
  });

  it('accepts a student with both customer and student roles', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      roles: [{ role: UserRole.CUSTOMER }, { role: UserRole.STUDENT }],
    });
    prismaMock.specialty.findMany.mockResolvedValue([]);
    const response = await request(createTestApp())
      .get('/api/student-specialties/eligible')
      .set(
        'Authorization',
        `Bearer ${createAccessToken([UserRole.CUSTOMER, UserRole.STUDENT])}`,
      );
    expect(response.status).toBe(200);
  });

  it('returns 404 for an association not owned by the student', async () => {
    prismaMock.studentSpecialty.findUnique.mockResolvedValue(null);
    const response = await request(createTestApp())
      .patch(`/api/student-specialties/${specialtyId}`)
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({ priceCents: 3000 });
    expect(response.status).toBe(404);
    expect(prismaMock.studentSpecialty.update).not.toHaveBeenCalled();
  });

  it('rejects a price above the PostgreSQL integer limit', async () => {
    const response = await request(createTestApp())
      .post('/api/student-specialties')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        specialtyId,
        pricingType: PricingType.HOURLY,
        priceCents: 2147483648,
      });
    expect(response.status).toBe(400);
  });
});
