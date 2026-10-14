import { Prisma, ProfileStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';

export const studentProfilesRouter = Router();
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim() || null;
}

function cleanProfileStatus(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'string' ||
    !Object.values(ProfileStatus).includes(value as ProfileStatus)
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'status is invalid');
  }

  return value as ProfileStatus;
}

function cleanDomainId(value: unknown, isRequired: true): string;
function cleanDomainId(value: unknown, isRequired?: false): string | undefined;
function cleanDomainId(value: unknown, isRequired = false) {
  if (value === undefined && !isRequired) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      isRequired ? 'domainId is required' : 'domainId is invalid',
    );
  }

  const domainId = value.trim();

  if (!uuidRegex.test(domainId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'domainId is invalid');
  }

  return domainId;
}

function handleStudentProfilePrismaError(error: unknown): never {
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

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  ) {
    throw new AppError(404, 'DOMAIN_NOT_FOUND', 'Domain not found');
  }

  throw error;
}

studentProfilesRouter.post(
  '/student-profiles',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.STUDENT)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    const body = request.body || {};
    const title = cleanText(body.title);
    const status = cleanProfileStatus(body.status);
    const domainId = cleanDomainId(body.domainId, true);

    if (body.title !== undefined && !title) {
      throw new AppError(400, 'VALIDATION_ERROR', 'title must be a string');
    }

    try {
      const profile = await prisma.studentProfile.create({
        data: {
          userId: authUser.id,
          domainId,
          title,
          description: cleanText(body.description),
          status: status ?? ProfileStatus.DRAFT,
        },
      });

      response.status(201).json(profile);
    } catch (error) {
      handleStudentProfilePrismaError(error);
    }
  },
);

studentProfilesRouter.get(
  '/student-profiles/me',
  requireAuth,
  async (_request, response) => {
    const authUser = response.locals.authUser as AuthUser;

    if (!authUser.roles.includes(UserRole.STUDENT)) {
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

    if (!authUser.roles.includes(UserRole.STUDENT)) {
      throw new AppError(403, 'FORBIDDEN', 'Forbidden');
    }

    const body = request.body || {};
    const title = cleanText(body.title);
    const status = cleanProfileStatus(body.status);
    const domainId = cleanDomainId(body.domainId);

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
      throw new AppError(400, 'VALIDATION_ERROR', 'title must be a string');
    }

    try {
      const profile = await prisma.studentProfile.update({
        where: {
          userId: authUser.id,
        },
        data: {
          domainId,
          title: title ?? undefined,
          description: cleanText(body.description),
          status,
        },
      });

      response.status(200).json(profile);
    } catch (error) {
      handleStudentProfilePrismaError(error);
    }
  },
);
