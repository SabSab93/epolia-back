import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { requireAuthAllowUnverified } from '@/modules/auth/auth.middleware';
import {
  readPageValue,
  cleanId,
  cleanEducation,
  assertDateOrder,
} from '@/modules/students/educations/student-educations-input';
import {
  getStudentProfile,
  lockStudentProfile,
  removeIneligibleSpecialties,
  unpublishStudentProfile,
} from '@/modules/students/eligibility';
import { requireStudent } from '@/modules/students/require-student';
import { prisma } from '@/prisma/client';
import { maxEducationsPerStudent } from '@/validation/input-limits';

export const studentEducationsRouter = Router();
const educationInclude = { studyField: { select: { id: true, label: true } } };
const educationResponse = {
  include: educationInclude,
  omit: { creationKey: true },
} as const;

function formatEducation(
  education: Prisma.StudentEducationGetPayload<typeof educationResponse>,
) {
  return {
    ...education,
    startDate: education.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: education.endDate?.toISOString().slice(0, 10) ?? null,
  };
}

async function assertStudyField(
  tx: Prisma.TransactionClient,
  id?: string | null,
) {
  if (
    id &&
    !(await tx.studyField.findUnique({ where: { id }, select: { id: true } }))
  ) {
    throw new AppError(404, 'STUDY_FIELD_NOT_FOUND', 'Study field not found');
  }
}

studentEducationsRouter.get(
  '/student-educations/me',
  requireAuthAllowUnverified,
  async (request, response) => {
    const user = requireStudent(response);
    const take = readPageValue(request.query.limit, 'limit', 1, 100);
    const skip = readPageValue(request.query.offset, 'offset', 0, 2147483647);
    await getStudentProfile(prisma, user.id);
    const educations = await prisma.studentEducation.findMany({
      where: { studentId: user.id },
      ...educationResponse,
      orderBy: [
        { startDate: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take,
      skip,
    });

    response.status(200).json(educations.map(formatEducation));
  },
);

studentEducationsRouter.post(
  '/student-educations',
  requireAuthAllowUnverified,
  async (request, response) => {
    const user = requireStudent(response);
    const key = request.get('Idempotency-Key');
    const creationKey =
      key === undefined ? undefined : cleanId(key, 'Idempotency-Key');
    const data = cleanEducation(request.body ?? {}, true);
    assertDateOrder(data.startDate, data.endDate);

    const { education, status } = await prisma.$transaction(async (tx) => {
      await lockStudentProfile(tx, user.id);
      if (creationKey) {
        const existing = await tx.studentEducation.findUnique({
          where: { studentId_creationKey: { studentId: user.id, creationKey } },
          ...educationResponse,
        });
        if (existing) return { education: existing, status: 200 };
      }

      const educationCount = await tx.studentEducation.count({
        where: { studentId: user.id },
      });
      if (educationCount >= maxEducationsPerStudent) {
        throw new AppError(
          409,
          'EDUCATION_LIMIT_REACHED',
          `A student can have at most ${maxEducationsPerStudent} educations`,
        );
      }

      await assertStudyField(tx, data.studyFieldId);
      const created = await tx.studentEducation.create({
        data: { ...data, title: data.title!, studentId: user.id, creationKey },
        ...educationResponse,
      });
      await unpublishStudentProfile(tx, user.id);

      return { education: created, status: 201 };
    });

    response.status(status).json(formatEducation(education));
  },
);

studentEducationsRouter.patch(
  '/student-educations/:educationId',
  requireAuthAllowUnverified,
  async (request, response) => {
    const user = requireStudent(response);
    const id = cleanId(request.params.educationId, 'educationId');
    const data = cleanEducation(request.body ?? {});

    const education = await prisma.$transaction(async (tx) => {
      const profile = await lockStudentProfile(tx, user.id);
      const existing = await tx.studentEducation.findFirst({
        where: { id, studentId: user.id },
      });

      if (!existing) {
        throw new AppError(
          404,
          'STUDENT_EDUCATION_NOT_FOUND',
          'Student education not found',
        );
      }

      assertDateOrder(
        data.startDate === undefined ? existing.startDate : data.startDate,
        data.endDate === undefined ? existing.endDate : data.endDate,
      );
      await assertStudyField(tx, data.studyFieldId);
      const updated = await tx.studentEducation.update({
        where: { id },
        data,
        ...educationResponse,
      });
      await removeIneligibleSpecialties(tx, user.id, profile.domainId);
      await unpublishStudentProfile(tx, user.id);

      return updated;
    });

    response.status(200).json(formatEducation(education));
  },
);

studentEducationsRouter.delete(
  '/student-educations/:educationId',
  requireAuthAllowUnverified,
  async (request, response) => {
    const user = requireStudent(response);
    const id = cleanId(request.params.educationId, 'educationId');

    await prisma.$transaction(async (tx) => {
      const profile = await lockStudentProfile(tx, user.id);
      const deleted = await tx.studentEducation.deleteMany({
        where: { id, studentId: user.id },
      });

      if (!deleted.count) {
        throw new AppError(
          404,
          'STUDENT_EDUCATION_NOT_FOUND',
          'Student education not found',
        );
      }

      await removeIneligibleSpecialties(tx, user.id, profile.domainId);
      await unpublishStudentProfile(tx, user.id);
    });

    response.status(204).send();
  },
);
