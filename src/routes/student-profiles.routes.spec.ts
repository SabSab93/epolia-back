import { AccountStatus, ProfileStatus, UserRole } from '@prisma/client';
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
      role: UserRole.STUDENT,
    },
  ],
};

const profileMock = {
  userId: userMock.id,
  domainId: '9324c24d-a476-41db-a0e3-12479bd81ed7',
  title: 'Developpeuse web',
  description: 'Creation de sites vitrines.',
  status: ProfileStatus.VISIBLE,
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
      roles: [UserRole.STUDENT],
    },
    config.jwtSecret,
  );
}

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api', studentProfilesRouter);
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
      .post('/api/student-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        title: ' Developpeuse web ',
        description: 'Creation de sites vitrines.',
        domainId: profileMock.domainId,
        status: ProfileStatus.VISIBLE,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      domainId: profileMock.domainId,
      title: 'Developpeuse web',
      status: ProfileStatus.VISIBLE,
    });
    expect(firstCallArg(prismaMock.studentProfile.create)).toMatchObject({
      data: {
        userId: userMock.id,
        domainId: profileMock.domainId,
        title: 'Developpeuse web',
        description: 'Creation de sites vitrines.',
        status: ProfileStatus.VISIBLE,
      },
    });
  });

  it('rejects profile creation without a domain id', async () => {
    const response = await request(createTestApp())
      .post('/api/student-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        title: 'Developpeuse web',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'domainId is required',
    });
    expect(prismaMock.studentProfile.create).not.toHaveBeenCalled();
  });

  it('rejects profile creation without a body', async () => {
    const response = await request(createTestApp())
      .post('/api/student-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'domainId is required',
    });
    expect(prismaMock.studentProfile.create).not.toHaveBeenCalled();
  });

  it('rejects profile creation for a non student user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userMock,
      roles: [
        {
          role: UserRole.CUSTOMER,
        },
      ],
    });

    const response = await request(createTestApp())
      .post('/api/student-profiles')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        title: 'Developpeuse web',
        domainId: profileMock.domainId,
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
      .get('/api/student-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      title: 'Developpeuse web',
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
      `/api/users/${userMock.id}/student-profile`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: userMock.id,
      title: 'Developpeuse web',
      status: ProfileStatus.VISIBLE,
    });
  });

  it('returns 404 when a student profile does not exist', async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(null);

    const response = await request(createTestApp())
      .get('/api/student-profiles/me')
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
      title: 'Developpeuse mobile',
    });

    const response = await request(createTestApp())
      .patch('/api/student-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`)
      .send({
        title: 'Developpeuse mobile',
      });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Developpeuse mobile');
    expect(firstCallArg(prismaMock.studentProfile.update)).toMatchObject({
      where: {
        userId: userMock.id,
      },
      data: {
        title: 'Developpeuse mobile',
      },
    });
  });

  it('does not fail with a 500 when update has no body', async () => {
    prismaMock.studentProfile.findUnique.mockResolvedValue(profileMock);
    prismaMock.studentProfile.update.mockResolvedValue(profileMock);

    const response = await request(createTestApp())
      .patch('/api/student-profiles/me')
      .set('Authorization', `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(prismaMock.studentProfile.update).toHaveBeenCalledWith({
      where: {
        userId: userMock.id,
      },
      data: {
        title: undefined,
        description: undefined,
        domainId: undefined,
        status: undefined,
      },
    });
  });
});
