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
  email: 'user@example.com',
  status: AccountStatus.ACTIVE,
  roles: [
    {
      role: UserRole.CUSTOMER,
    },
  ],
};

const profileMock = {
  userId: userMock.id,
  firstName: 'Sabrina',
  lastName: 'Hammadi',
  photoUrl: null,
  city: 'Paris',
  latitude: 48.8566,
  longitude: 2.3522,
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
      roles: [UserRole.CUSTOMER],
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

  it('creates the authenticated user profile', async () => {
    prismaMock.userProfile.create.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .post('/api/v1/user-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        firstName: ' Sabrina ',
        lastName: 'Hammadi',
        city: 'Paris',
        latitude: 48.8566,
        longitude: 2.3522,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      firstName: 'Sabrina',
      lastName: 'Hammadi',
      city: 'Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(firstCallArg(prismaMock.userProfile.create)).toMatchObject({
      data: {
        userId: userMock.id,
        firstName: 'Sabrina',
        lastName: 'Hammadi',
        city: 'Paris',
        latitude: 48.8566,
        longitude: 2.3522,
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
    expect(prismaMock.userProfile.create).not.toHaveBeenCalled();
  });

  it('returns the authenticated user full profile', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .get('/api/v1/user-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      firstName: 'Sabrina',
      city: 'Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(prismaMock.userProfile.findUnique).toHaveBeenCalledWith({
      where: {
        userId: userMock.id,
      },
    });
  });

  it('returns a public profile by user id', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue({
      userId: userMock.id,
      firstName: 'Sabrina',
      lastName: 'Hammadi',
      photoUrl: null,
      city: 'Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });

    const response = await request(createTestApp()).get(
      `/api/v1/users/${userMock.id}/profile`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      firstName: 'Sabrina',
      city: 'Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    const prismaCall = firstCallArg<{
      where: { userId: string };
      select: Record<string, boolean>;
    }>(prismaMock.userProfile.findUnique);

    expect(prismaCall.where.userId).toBe(userMock.id);
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

  it('clears nullable profile fields', async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.userProfile.update.mockResolvedValue({
      ...profileMock,
      latitude: null,
    });

    const response = await request(createTestApp())
      .patch('/api/v1/user-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        latitude: null,
      });

    expect(response.status).toBe(200);
    expect(response.body.latitude).toBeNull();
    expect(firstCallArg(prismaMock.userProfile.update)).toMatchObject({
      where: {
        userId: userMock.id,
      },
      data: {
        latitude: null,
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
