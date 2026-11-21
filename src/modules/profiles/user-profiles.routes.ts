import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { getAuthUser } from '@/modules/auth/auth-user';
import { requireAuthAllowUnverified } from '@/modules/auth/auth.middleware';
import { prisma } from '@/prisma/client';
import { cleanOptionalText } from '@/validation/input-formats';
import { assertMaxLength, maxLength } from '@/validation/input-limits';

export const userProfilesRouter = Router();

function profileNotFound() {
  return new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
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
  requireAuthAllowUnverified,
  async (request, response) => {
    const authUser = getAuthUser(response);
    const body = request.body || {};

    if (typeof body.firstName !== 'string' || body.firstName.trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'firstName is required');
    }
    assertMaxLength(body.firstName, 'firstName', maxLength.name);
    assertMaxLength(body.lastName, 'lastName', maxLength.name);
    assertMaxLength(body.city, 'city', maxLength.city);
    assertMaxLength(body.photoUrl, 'photoUrl', maxLength.photoUrl);

    const profileData = {
      firstName: body.firstName.trim(),
      lastName: cleanOptionalText(body.lastName),
      photoUrl: cleanOptionalText(body.photoUrl),
      city: cleanOptionalText(body.city),
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
  requireAuthAllowUnverified,
  async (_request, response) => {
    const authUser = getAuthUser(response);

    const profile = await prisma.userProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!profile) {
      throw profileNotFound();
    }

    response.status(200).json(profile);
  },
);

userProfilesRouter.get(
  '/users/:userId/profile',
  requireAuthAllowUnverified,
  async (request, response) => {
    const { id: userId } = getAuthUser(response);
    if (request.params.userId !== userId) throw profileNotFound();

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        city: true,
      },
    });

    if (!profile) throw profileNotFound();
    response.status(200).json(profile);
  },
);

userProfilesRouter.patch(
  '/user-profiles/me',
  requireAuthAllowUnverified,
  async (request, response) => {
    const authUser = getAuthUser(response);
    const body = request.body || {};

    const existingProfile = await prisma.userProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!existingProfile) {
      throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
    }

    const firstName = cleanOptionalText(body.firstName);

    if (body.firstName !== undefined && !firstName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'firstName is required');
    }
    assertMaxLength(body.firstName, 'firstName', maxLength.name);
    assertMaxLength(body.lastName, 'lastName', maxLength.name);
    assertMaxLength(body.city, 'city', maxLength.city);
    assertMaxLength(body.photoUrl, 'photoUrl', maxLength.photoUrl);

    const profile = await prisma.userProfile.update({
      where: {
        userId: authUser.id,
      },
      data: {
        firstName: firstName ?? undefined,
        lastName: cleanOptionalText(body.lastName),
        photoUrl: cleanOptionalText(body.photoUrl),
        city: cleanOptionalText(body.city),
        latitude: cleanCoordinate(body.latitude, 'latitude', -90, 90),
        longitude: cleanCoordinate(body.longitude, 'longitude', -180, 180),
      },
    });

    response.status(200).json(profile);
  },
);

userProfilesRouter.delete(
  '/user-profiles/me',
  requireAuthAllowUnverified,
  async (_request, response) => {
    const authUser = getAuthUser(response);

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
