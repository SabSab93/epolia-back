import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';

export const userProfilesRouter = Router();

function cleanText(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim() || null;
}

function cleanCoordinate(
  value: unknown,
  name: 'latitude' | 'longitude',
  min: number,
  max: number,
) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', `${name} is invalid`);
  }

  return value;
}

userProfilesRouter.post(
  '/user-profiles',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;
    const body = request.body || {};

    if (typeof body.firstName !== 'string' || body.firstName.trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'firstName is required');
    }

    const profileData = {
      firstName: body.firstName.trim(),
      lastName: cleanText(body.lastName),
      photoUrl: cleanText(body.photoUrl),
      city: cleanText(body.city),
      latitude: cleanCoordinate(body.latitude, 'latitude', -90, 90),
      longitude: cleanCoordinate(body.longitude, 'longitude', -180, 180),
    };

    try {
      const profile = await prisma.userProfile.create({
        data: {
          userId: authUser.id,
          ...profileData,
        },
      });

      response.status(201).json(profile);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppError(
          409,
          'PROFILE_ALREADY_EXISTS',
          'Profile already exists',
        );
      }

      throw error;
    }
  },
);

userProfilesRouter.get(
  '/user-profiles/me',
  requireAuth,
  async (_request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    const profile = await prisma.userProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!profile) {
      throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    }

    response.status(200).json(profile);
  },
);

userProfilesRouter.get('/users/:userId/profile', async (request, response) => {
  const profile = await prisma.userProfile.findUnique({
    where: {
      userId: request.params.userId,
    },
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      city: true,
    },
  });

  if (!profile) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
  }

  response.status(200).json(profile);
});

userProfilesRouter.patch(
  '/user-profiles/me',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;
    const body = request.body || {};

    const existingProfile = await prisma.userProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!existingProfile) {
      throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    }

    const firstName = cleanText(body.firstName);

    if (body.firstName !== undefined && !firstName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'firstName is required');
    }

    const profile = await prisma.userProfile.update({
      where: {
        userId: authUser.id,
      },
      data: {
        firstName: firstName ?? undefined,
        lastName: cleanText(body.lastName),
        photoUrl: cleanText(body.photoUrl),
        city: cleanText(body.city),
        latitude: cleanCoordinate(body.latitude, 'latitude', -90, 90),
        longitude: cleanCoordinate(body.longitude, 'longitude', -180, 180),
      },
    });

    response.status(200).json(profile);
  },
);

userProfilesRouter.delete(
  '/user-profiles/me',
  requireAuth,
  async (_request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    const existingProfile = await prisma.userProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!existingProfile) {
      throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    }

    await prisma.userProfile.delete({
      where: {
        userId: authUser.id,
      },
    });

    response.status(204).send();
  },
);
