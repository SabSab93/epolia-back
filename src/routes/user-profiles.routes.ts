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

function cleanCountry(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  return value.trim().toUpperCase();
}

userProfilesRouter.post(
  '/user-profiles',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;
    const body = request.body as Record<string, unknown>;

    if (typeof body.firstName !== 'string' || body.firstName.trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'firstName is required');
    }

    const profileData = {
      firstName: body.firstName.trim(),
      lastName: cleanText(body.lastName),
      photoUrl: cleanText(body.photoUrl),
      address: cleanText(body.address),
      postalCode: cleanText(body.postalCode),
      city: cleanText(body.city),
      country: cleanCountry(body.country) ?? 'FR',
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
      country: true,
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
    const body = request.body as Record<string, unknown>;

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
        address: cleanText(body.address),
        postalCode: cleanText(body.postalCode),
        city: cleanText(body.city),
        country: cleanCountry(body.country),
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
