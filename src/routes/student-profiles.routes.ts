import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';

export const studentProfilesRouter = Router();

function cleanText(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim() || null;
}

function getHourlyRate(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}

studentProfilesRouter.post(
  '/student-profiles',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.ETUDIANT)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    const body = request.body || {};
    const hourlyRateCents = getHourlyRate(body.hourlyRateCents);

    if (typeof body.title !== 'string' || body.title.trim() === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'title is required');
    }

    if (!hourlyRateCents) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'hourlyRateCents must be a positive integer',
      );
    }

    try {
      const profile = await prisma.studentProfile.create({
        data: {
          userId: authUser.id,
          title: body.title.trim(),
          description: cleanText(body.description),
          hourlyRateCents,
          level: cleanText(body.level),
          status: cleanText(body.status) ?? 'DRAFT',
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
          'STUDENT_PROFILE_ALREADY_EXISTS',
          'Student profile already exists',
        );
      }

      throw error;
    }
  },
);

studentProfilesRouter.get(
  '/student-profiles/me',
  requireAuth,
  async (_request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.ETUDIANT)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    const profile = await prisma.studentProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!profile) {
      throw new AppError(
        404,
        'STUDENT_PROFILE_NOT_FOUND',
        'Student profile not found',
      );
    }

    response.status(200).json(profile);
  },
);

studentProfilesRouter.get(
  '/users/:userId/student-profile',
  async (request, response) => {
    const profile = await prisma.studentProfile.findUnique({
      where: {
        userId: request.params.userId,
      },
    });

    if (!profile) {
      throw new AppError(
        404,
        'STUDENT_PROFILE_NOT_FOUND',
        'Student profile not found',
      );
    }

    response.status(200).json(profile);
  },
);

studentProfilesRouter.patch(
  '/student-profiles/me',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.ETUDIANT)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    const body = request.body || {};
    const title = cleanText(body.title);
    const hourlyRateCents = getHourlyRate(body.hourlyRateCents);

    const existingProfile = await prisma.studentProfile.findUnique({
      where: {
        userId: authUser.id,
      },
    });

    if (!existingProfile) {
      throw new AppError(
        404,
        'STUDENT_PROFILE_NOT_FOUND',
        'Student profile not found',
      );
    }

    if (body.title !== undefined && !title) {
      throw new AppError(400, 'VALIDATION_ERROR', 'title is required');
    }

    if (body.hourlyRateCents !== undefined && !hourlyRateCents) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'hourlyRateCents must be a positive integer',
      );
    }

    const profile = await prisma.studentProfile.update({
      where: {
        userId: authUser.id,
      },
      data: {
        title: title ?? undefined,
        description: cleanText(body.description),
        hourlyRateCents,
        level: cleanText(body.level),
        status: cleanText(body.status) ?? undefined,
      },
    });

    response.status(200).json(profile);
  },
);
