import { Prisma, PricingType, UserRole } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';
import {
  assertSpecialtyEligible,
  eligibleSpecialtyWhere,
  getStudentProfile,
  lockStudentProfile,
  unpublishStudentProfile,
} from '@/services/student-specialties';

export const studentSpecialtiesRouter = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const studentSpecialtySelect = {
  studentId: true,
  specialtyId: true,
  pricingType: true,
  priceCents: true,
  pricingDetails: true,
  createdAt: true,
  updatedAt: true,
  specialty: {
    select: {
      id: true,
      domainId: true,
      label: true,
      domain: {
        select: {
          id: true,
          label: true,
        },
      },
    },
  },
} satisfies Prisma.StudentSpecialtySelect;

function requireStudent(response: { locals: { authUser?: AuthUser } }) {
  const authUser = response.locals.authUser as AuthUser;

  if (!authUser.roles.includes(UserRole.STUDENT)) {
    throw new AppError(403, 'FORBIDDEN', 'Forbidden');
  }

  return authUser;
}

function cleanSpecialtyId(value: unknown, isRequired: true): string;
function cleanSpecialtyId(
  value: unknown,
  isRequired?: false,
): string | undefined;
function cleanSpecialtyId(value: unknown, isRequired = false) {
  if (value === undefined && !isRequired) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      isRequired ? 'specialtyId is required' : 'specialtyId is invalid',
    );
  }

  const specialtyId = value.trim();

  if (!uuidRegex.test(specialtyId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'specialtyId is invalid');
  }

  return specialtyId;
}

function cleanPricingType(value: unknown, isRequired: true): PricingType;
function cleanPricingType(
  value: unknown,
  isRequired?: false,
): PricingType | undefined;
function cleanPricingType(value: unknown, isRequired = false) {
  if (value === undefined && !isRequired) {
    return undefined;
  }

  if (
    typeof value !== 'string' ||
    !Object.values(PricingType).includes(value as PricingType)
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'pricingType is invalid');
  }

  return value as PricingType;
}

function cleanPriceCents(value: unknown, isRequired: true): number;
function cleanPriceCents(
  value: unknown,
  isRequired?: false,
): number | undefined;
function cleanPriceCents(value: unknown, isRequired = false) {
  if (value === undefined && !isRequired) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 2147483647
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'priceCents must be a positive integer',
    );
  }

  return value;
}

function cleanPricingDetails(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'pricingDetails must be a string',
    );
  }

  return value.trim() || null;
}

function handleStudentSpecialtyPrismaError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new AppError(
      409,
      'STUDENT_SPECIALTY_ALREADY_EXISTS',
      'Student specialty already exists',
    );
  }

  throw error;
}

studentSpecialtiesRouter.get(
  '/student-specialties/me',
  requireAuth,
  async (_request, response) => {
    const authUser = requireStudent(response);
    await getStudentProfile(prisma, authUser.id);

    const specialties = await prisma.studentSpecialty.findMany({
      where: {
        studentId: authUser.id,
      },
      select: studentSpecialtySelect,
      orderBy: {
        specialty: {
          label: 'asc',
        },
      },
    });

    response.status(200).json(specialties);
  },
);

studentSpecialtiesRouter.get(
  '/student-specialties/eligible',
  requireAuth,
  async (_request, response) => {
    const authUser = requireStudent(response);
    const profile = await getStudentProfile(prisma, authUser.id);
    const specialties = await prisma.specialty.findMany({
      where: eligibleSpecialtyWhere(authUser.id, profile.domainId),
      select: {
        id: true,
        label: true,
        domainId: true,
        domain: { select: { id: true, label: true } },
      },
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
    });

    response.status(200).json(specialties);
  },
);

studentSpecialtiesRouter.post(
  '/student-specialties',
  requireAuth,
  async (request, response) => {
    const authUser = requireStudent(response);
    const body = request.body || {};
    const specialtyId = cleanSpecialtyId(body.specialtyId, true);
    const pricingType = cleanPricingType(body.pricingType, true);
    const priceCents = cleanPriceCents(body.priceCents, true);
    const pricingDetails = cleanPricingDetails(body.pricingDetails);

    try {
      const studentSpecialty = await prisma.$transaction(async (tx) => {
        const profile = await lockStudentProfile(tx, authUser.id);
        const specialty = await tx.specialty.findUnique({
          where: { id: specialtyId },
          select: { id: true, domainId: true },
        });

        if (!specialty) {
          throw new AppError(404, 'SPECIALTY_NOT_FOUND', 'Specialty not found');
        }

        if (specialty.domainId !== profile.domainId) {
          throw new AppError(
            400,
            'SPECIALTY_DOMAIN_MISMATCH',
            'Specialty does not belong to the selected domain',
          );
        }

        await assertSpecialtyEligible(tx, authUser.id, specialtyId);
        const created = await tx.studentSpecialty.create({
          data: {
            studentId: authUser.id,
            specialtyId,
            pricingType,
            priceCents,
            pricingDetails,
          },
          select: studentSpecialtySelect,
        });
        await unpublishStudentProfile(tx, authUser.id);

        return created;
      });

      response.status(201).json(studentSpecialty);
    } catch (error) {
      handleStudentSpecialtyPrismaError(error);
    }
  },
);

studentSpecialtiesRouter.patch(
  '/student-specialties/:specialtyId',
  requireAuth,
  async (request, response) => {
    const authUser = requireStudent(response);
    const specialtyId = cleanSpecialtyId(request.params.specialtyId, true);
    const body = request.body || {};
    const pricingType = cleanPricingType(body.pricingType);
    const priceCents = cleanPriceCents(body.priceCents);
    const pricingDetails = cleanPricingDetails(body.pricingDetails);

    const studentSpecialty = await prisma.$transaction(async (tx) => {
      const profile = await lockStudentProfile(tx, authUser.id);
      const existingSpecialty = await tx.studentSpecialty.findUnique({
        where: {
          studentId_specialtyId: {
            studentId: authUser.id,
            specialtyId,
          },
        },
        select: {
          specialty: {
            select: {
              domainId: true,
            },
          },
        },
      });

      if (!existingSpecialty) {
        throw new AppError(
          404,
          'STUDENT_SPECIALTY_NOT_FOUND',
          'Student specialty not found',
        );
      }

      if (existingSpecialty.specialty.domainId !== profile.domainId) {
        throw new AppError(
          400,
          'SPECIALTY_DOMAIN_MISMATCH',
          'Specialty does not belong to the selected domain',
        );
      }

      await assertSpecialtyEligible(tx, authUser.id, specialtyId);
      return tx.studentSpecialty.update({
        where: {
          studentId_specialtyId: {
            studentId: authUser.id,
            specialtyId,
          },
        },
        data: {
          pricingType,
          priceCents,
          pricingDetails,
        },
        select: studentSpecialtySelect,
      });
    });

    response.status(200).json(studentSpecialty);
  },
);

studentSpecialtiesRouter.delete(
  '/student-specialties/:specialtyId',
  requireAuth,
  async (request, response) => {
    const authUser = requireStudent(response);
    const specialtyId = cleanSpecialtyId(request.params.specialtyId, true);

    await prisma.$transaction(async (tx) => {
      await lockStudentProfile(tx, authUser.id);
      await tx.studentSpecialty.deleteMany({
        where: { studentId: authUser.id, specialtyId },
      });
    });

    response.status(204).send();
  },
);
