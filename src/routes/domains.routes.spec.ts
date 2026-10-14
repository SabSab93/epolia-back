import express from 'express';
import request from 'supertest';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { domainsRouter } from '@/routes/domains.routes';
import { studyFieldsRouter } from '@/routes/study-fields.routes';

jest.mock('@/prisma/client', () => {
  const mockPrisma = {
    domain: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    specialty: {
      findMany: jest.fn(),
    },
    studyField: { findMany: jest.fn() },
  };

  return {
    prisma: mockPrisma,
  };
});

const domainMock = {
  id: '9324c24d-a476-41db-a0e3-12479bd81ed7',
  label: 'Developpement web',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const specialtyMock = {
  id: '472e5d8d-e7bf-4513-a812-7970ecb65e9c',
  domainId: domainMock.id,
  label: 'Application web',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  domain: {
    findMany: SingleArgMock;
    findUnique: SingleArgMock;
  };
  specialty: {
    findMany: SingleArgMock;
  };
  studyField: { findMany: SingleArgMock };
};

const prismaMock = prisma as unknown as PrismaMock;

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api', domainsRouter);
  app.use('/api', studyFieldsRouter);
  app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });
  app.use(errorHandler);

  return app;
}

describe('Domain routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns domains sorted by label', async () => {
    prismaMock.domain.findMany.mockResolvedValue([domainMock]);

    const response = await request(createTestApp()).get('/api/domains');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject([
      {
        id: domainMock.id,
        label: domainMock.label,
      },
    ]);
    expect(prismaMock.domain.findMany).toHaveBeenCalledWith({
      orderBy: {
        label: 'asc',
      },
    });
  });

  it('returns an empty domain catalog', async () => {
    prismaMock.domain.findMany.mockResolvedValue([]);

    const response = await request(createTestApp()).get('/api/domains');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns an empty study field catalog without authentication', async () => {
    prismaMock.studyField.findMany.mockResolvedValue([]);
    const response = await request(createTestApp()).get('/api/study-fields');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns specialties for a domain', async () => {
    prismaMock.domain.findUnique.mockResolvedValue(domainMock);
    prismaMock.specialty.findMany.mockResolvedValue([specialtyMock]);

    const response = await request(createTestApp()).get(
      `/api/domains/${domainMock.id}/specialties`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject([
      {
        id: specialtyMock.id,
        domainId: domainMock.id,
        label: specialtyMock.label,
      },
    ]);
    expect(prismaMock.specialty.findMany).toHaveBeenCalledWith({
      where: {
        domainId: domainMock.id,
      },
      orderBy: {
        label: 'asc',
      },
    });
  });

  it('rejects an invalid domain id when listing specialties', async () => {
    const response = await request(createTestApp()).get(
      '/api/domains/not-a-uuid/specialties',
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'domainId is invalid',
    });
    expect(prismaMock.specialty.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when listing specialties for an unknown domain', async () => {
    prismaMock.domain.findUnique.mockResolvedValue(null);

    const response = await request(createTestApp()).get(
      `/api/domains/${domainMock.id}/specialties`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 404,
      code: 'DOMAIN_NOT_FOUND',
      message: 'Domain not found',
    });
  });
});
