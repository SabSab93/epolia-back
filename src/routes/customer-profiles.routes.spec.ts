import { AccountStatus, UserRole } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { customerProfilesRouter } from '@/routes/customer-profiles.routes';

jest.mock('@/prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    customerProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  return {
    prisma: mockPrisma,
  };
});

const userMock = {
  id: '0f2f2c96-8f55-4a42-86ad-b9d9981edb34',
  email: 'customer@example.com',
  status: AccountStatus.ACTIVE,
  roles: [
    {
      role: UserRole.PARTICULIER,
    },
  ],
};

const profileMock = {
  userId: userMock.id,
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  user: {
    findUnique: SingleArgMock;
  };
  customerProfile: {
    findUnique: SingleArgMock;
    create: SingleArgMock;
    update: SingleArgMock;
    delete: SingleArgMock;
  };
};

const prismaMock = prisma as unknown as PrismaMock;

function createAccessToken() {
  return jwt.sign(
    {
      sub: userMock.id,
      email: userMock.email,
      roles: [UserRole.PARTICULIER],
    },
    config.jwtSecret,
  );
}

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api/v1', customerProfilesRouter);
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

describe('Customer profile routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(userMock);
  });

  it('creates the authenticated customer profile', async () => {
    prismaMock.customerProfile.create.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .post('/api/v1/customer-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      status: 'ACTIVE',
    });
    expect(firstCallArg(prismaMock.customerProfile.create)).toMatchObject({
      data: {
        userId: userMock.id,
        status: 'ACTIVE',
      },
    });
  });

  it('rejects profile creation for a non customer user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      roles: [
        {
          role: UserRole.ETUDIANT,
        },
      ],
    });

    const response = await request(createTestApp())
      .post('/api/v1/customer-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
    expect(prismaMock.customerProfile.create).not.toHaveBeenCalled();
  });

  it('returns the authenticated customer profile', async () => {
    prismaMock.customerProfile.findUnique.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .get('/api/v1/customer-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      status: 'ACTIVE',
    });
    expect(prismaMock.customerProfile.findUnique).toHaveBeenCalledWith({
      where: {
        userId: userMock.id,
      },
    });
  });

  it('returns a customer profile by user id', async () => {
    prismaMock.customerProfile.findUnique.mockResolvedValue(profileMock);

    const response = await request(createTestApp()).get(
      `/api/v1/users/${userMock.id}/customer-profile`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      status: 'ACTIVE',
    });
  });

  it('returns 404 when a customer profile does not exist', async () => {
    prismaMock.customerProfile.findUnique.mockResolvedValue(null);

    const response = await request(createTestApp())
      .get('/api/v1/customer-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 404,
      code: 'CUSTOMER_PROFILE_NOT_FOUND',
      message: 'Customer profile not found',
    });
  });

  it('updates the authenticated customer profile', async () => {
    prismaMock.customerProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.customerProfile.update.mockResolvedValue({
      ...profileMock,
      status: 'SUSPENDED',
    });

    const response = await request(createTestApp())
      .patch('/api/v1/customer-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        status: 'SUSPENDED',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('SUSPENDED');
    expect(firstCallArg(prismaMock.customerProfile.update)).toMatchObject({
      where: {
        userId: userMock.id,
      },
      data: {
        status: 'SUSPENDED',
      },
    });
  });

  it('deletes the authenticated customer profile', async () => {
    prismaMock.customerProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.customerProfile.delete.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .delete('/api/v1/customer-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(204);
    expect(prismaMock.customerProfile.delete).toHaveBeenCalledWith({
      where: {
        userId: userMock.id,
      },
    });
  });
});
