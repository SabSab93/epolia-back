import { AccountStatus, UserRole } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { userProfilesRouter } from '@/routes/user-profiles.routes';

jest.mock('@/prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
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
  email: 'user@example.com',
  status: AccountStatus.ACTIVE,
  roles: [
    {
      role: UserRole.PARTICULIER,
    },
  ],
};

const profileMock = {
  userId: userMock.id,
  firstName: 'Sabrina',
  lastName: 'Hammadi',
  photoUrl: null,
  address: '10 rue de Paris',
  postalCode: '75001',
  city: 'Paris',
  country: 'FR',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  user: {
    findUnique: SingleArgMock;
  };
  userProfile: {
    findUnique: SingleArgMock;
    upsert: SingleArgMock;
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
  app.use('/api/v1', userProfilesRouter);
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

describe('User profile routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(userMock);
  });

  it('creates or updates the authenticated user profile', async () => {
    prismaMock.userProfile.upsert.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .post('/api/v1/user-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        firstName: ' Sabrina ',
        lastName: 'Hammadi',
        address: '10 rue de Paris',
        postalCode: '75001',
        city: 'Paris',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      firstName: 'Sabrina',
      lastName: 'Hammadi',
      address: '10 rue de Paris',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
    });
    expect(firstCallArg(prismaMock.userProfile.upsert)).toMatchObject({
      where: {
        userId: userMock.id,
      },
      create: {
        userId: userMock.id,
        firstName: 'Sabrina',
        lastName: 'Hammadi',
        address: '10 rue de Paris',
        postalCode: '75001',
        city: 'Paris',
        country: 'FR',
      },
      update: {
        firstName: 'Sabrina',
        lastName: 'Hammadi',
        address: '10 rue de Paris',
        postalCode: '75001',
        city: 'Paris',
        country: 'FR',
      },
    });
  });

  it('rejects profile creation without firstName', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/user-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        city: 'Paris',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'firstName is required',
    });
    expect(prismaMock.userProfile.upsert).not.toHaveBeenCalled();
  });

  it('returns a profile by user id', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profileMock);

    const response = await request(createTestApp()).get(
      `/api/v1/users/${userMock.id}/profile`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      firstName: 'Sabrina',
      address: '10 rue de Paris',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
    });
    expect(prismaMock.userProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: userMock.id,
        },
      }),
    );
  });

  it('returns 404 when a profile does not exist', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(null);

    const response = await request(createTestApp()).get(
      `/api/v1/users/${userMock.id}/profile`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 404,
      code: 'PROFILE_NOT_FOUND',
      message: 'Profile not found',
    });
  });

  it('updates the authenticated user profile', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.userProfile.update.mockResolvedValue({
      ...profileMock,
      city: 'Lyon',
    });

    const response = await request(createTestApp())
      .patch('/api/v1/user-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        city: 'Lyon',
      });

    expect(response.status).toBe(200);
    expect(response.body.city).toBe('Lyon');
    expect(firstCallArg(prismaMock.userProfile.update)).toMatchObject({
      where: {
        userId: userMock.id,
      },
      data: {
        city: 'Lyon',
      },
    });
  });

  it('deletes the authenticated user profile', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.userProfile.delete.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .delete('/api/v1/user-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(204);
    expect(prismaMock.userProfile.delete).toHaveBeenCalledWith({
      where: {
        userId: userMock.id,
      },
    });
  });
});
