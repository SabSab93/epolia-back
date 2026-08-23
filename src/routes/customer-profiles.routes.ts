import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';

export const customerProfilesRouter = Router();

customerProfilesRouter.post(
  '/customer-profiles',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.PARTICULIER)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    try {
      const profile = await prisma.customerProfile.create({
        data: {
          userId: authUser.id,
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
          'CUSTOMER_PROFILE_ALREADY_EXISTS',
          'Customer profile already exists',
        );
      }

      throw error;
    }
  },
);

customerProfilesRouter.get(
  '/customer-profiles/me',
  requireAuth,
  async (_request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.PARTICULIER)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    const profile = await prisma.customerProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!profile) {
      throw new AppError(
        404,
        'CUSTOMER_PROFILE_NOT_FOUND',
        'Customer profile not found',
      );
    }

    response.status(200).json(profile);
  },
);

customerProfilesRouter.get(
  '/users/:userId/customer-profile',
  async (request, response) => {
    const profile = await prisma.customerProfile.findUnique({
      where: {
        userId: request.params.userId,
      },
    });

    if (!profile) {
      throw new AppError(
        404,
        'CUSTOMER_PROFILE_NOT_FOUND',
        'Customer profile not found',
      );
    }

    response.status(200).json(profile);
  },
);

customerProfilesRouter.delete(
  '/customer-profiles/me',
  requireAuth,
  async (_request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.PARTICULIER)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    const existingProfile = await prisma.customerProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!existingProfile) {
      throw new AppError(
        404,
        'CUSTOMER_PROFILE_NOT_FOUND',
        'Customer profile not found',
      );
    }

    await prisma.customerProfile.delete({
      where: {
        userId: authUser.id,
      },
    });

    response.status(204).send();
  },
);
