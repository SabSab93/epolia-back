import { AccountStatus, UserRole } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';
import { prisma } from '@/prisma/client';
import { studentProfilesRouter } from '@/routes/student-profiles.routes';

jest.mock('@/prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    studentProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  return {
    prisma: mockPrisma,
  };
});

const userMock = {
  id: '0f2f2c96-8f55-4a42-86ad-b9d9981edb34',
  email: 'student@example.com',
  status: AccountStatus.ACTIVE,
  roles: [
    {
      role: UserRole.ETUDIANT,
    },
  ],
};

const profileMock = {
  userId: userMock.id,
  title: 'Developpeuse web',
  description: 'Creation de sites vitrines.',
  hourlyRateCents: 2500,
  level: 'MBA1',
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;

type PrismaMock = {
  user: {
    findUnique: SingleArgMock;
  };
  studentProfile: {
    findUnique: SingleArgMock;
    create: SingleArgMock;
    update: SingleArgMock;
  };
};

const prismaMock = prisma as unknown as PrismaMock;

function createAccessToken() {
  return jwt.sign(
    {
      sub: userMock.id,
      email: userMock.email,
      roles: [UserRole.ETUDIANT],
    },
    config.jwtSecret,
  );
}

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api/v1', studentProfilesRouter);
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

describe('Student profile routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(userMock);
  });

  it('creates the authenticated student profile', async () => {
    prismaMock.studentProfile.create.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .post('/api/v1/student-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        title: ' Developpeuse web ',
        description: 'Creation de sites vitrines.',
        hourlyRateCents: 2500,
        level: 'MBA1',
        status: 'ACTIVE',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      title: 'Developpeuse web',
      hourlyRateCents: 2500,
      level: 'MBA1',
      status: 'ACTIVE',
    });
    expect(firstCallArg(prismaMock.studentProfile.create)).toMatchObject({
      data: {
        userId: userMock.id,
        title: 'Developpeuse web',
        description: 'Creation de sites vitrines.',
        hourlyRateCents: 2500,
        level: 'MBA1',
        status: 'ACTIVE',
      },
    });
  });

  it('rejects profile creation with an invalid hourly rate', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/student-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        title: 'Developpeuse web',
        hourlyRateCents: 0,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'hourlyRateCents must be a positive integer',
    });
    expect(prismaMock.studentProfile.create).not.toHaveBeenCalled();
  });

  it('rejects profile creation for a non student user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      roles: [
        {
          role: UserRole.PARTICULIER,
        },
      ],
    });

    const response = await request(createTestApp())
      .post('/api/v1/student-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        title: 'Developpeuse web',
        hourlyRateCents: 2500,
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
    expect(prismaMock.studentProfile.create).not.toHaveBeenCalled();
  });

  it('returns the authenticated student profile', async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .get('/api/v1/student-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      title: 'Developpeuse web',
      hourlyRateCents: 2500,
    });
    expect(prismaMock.studentProfile.findUnique).toHaveBeenCalledWith({
      where: {
        userId: userMock.id,
      },
    });
  });

  it('returns a student profile by user id', async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(profileMock);

    const response = await request(createTestApp()).get(
      `/api/v1/users/${userMock.id}/student-profile`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      title: 'Developpeuse web',
      status: 'ACTIVE',
    });
  });

  it('returns 404 when a student profile does not exist', async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(null);

    const response = await request(createTestApp())
      .get('/api/v1/student-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 404,
      code: 'STUDENT_PROFILE_NOT_FOUND',
      message: 'Student profile not found',
    });
  });

  it('updates the authenticated student profile', async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.studentProfile.update.mockResolvedValue({
      ...profileMock,
      hourlyRateCents: 3000,
    });

    const response = await request(createTestApp())
      .patch('/api/v1/student-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        hourlyRateCents: 3000,
      });

    expect(response.status).toBe(200);
    expect(response.body.hourlyRateCents).toBe(3000);
    expect(firstCallArg(prismaMock.studentProfile.update)).toMatchObject({
      where: {
        userId: userMock.id,
      },
      data: {
        hourlyRateCents: 3000,
      },
    });
  });
});
