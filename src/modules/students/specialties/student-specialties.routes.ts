import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { requireAuthAllowUnverified } from '@/modules/auth/auth.middleware';
import {
  assertSpecialtyEligible,
  eligibleSpecialtyWhere,
  getStudentProfile,
  lockStudentProfile,
  unpublishStudentProfile,
} from '@/modules/students/eligibility';
import { requireStudent } from '@/modules/students/require-student';
import {
  cleanSpecialtyId,
  cleanPricingType,
  cleanPriceCents,
  cleanPricingDetails,
} from '@/modules/students/specialties/student-specialties-input';
import { prisma } from '@/prisma/client';

export const studentSpecialtiesRouter = Router();

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
  requireAuthAllowUnverified,
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
  requireAuthAllowUnverified,
  async (_request, response) => {
    const authUser = requireStudent(response);
    const profile = await getStudentProfile(prisma, authUser.id);
    const specialties = await prisma.specialty.findMany({
      where: eligibleSpecialtyWhere(authUser.id, profile.domainId ?? undefined),
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
  requireAuthAllowUnverified,
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
        if (!profile.domainId) {
          throw new AppError(409, 'DOMAIN_REQUIRED', 'Select a domain first');
        }

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
  requireAuthAllowUnverified,
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
  requireAuthAllowUnverified,
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
