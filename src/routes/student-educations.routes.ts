import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';
import {
  getStudentProfile,
  lockStudentProfile,
  removeIneligibleSpecialties,
  unpublishStudentProfile,
} from '@/services/student-specialties';

export const studentEducationsRouter = Router();
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const educationInclude = { studyField: { select: { id: true, label: true } } };

function requireStudent(response: { locals: { authUser?: AuthUser } }) {
  const user = response.locals.authUser as AuthUser;

  if (!user.roles.includes(UserRole.STUDENT)) {
    throw new AppError(403, 'FORBIDDEN', 'Forbidden');
  }

  return user;
}

function cleanId(value: unknown, field: string) {
  if (typeof value !== 'string' || !uuidRegex.test(value.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} is invalid`);
  }

  return value.trim();
}

function cleanText(value: unknown, field: string, required = false) {
  if (value === undefined && !required) {
    return undefined;
  }

  if (value === null && !required) {
    return null;
  }

  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${field} must be a non-empty string`,
    );
  }

  return value.trim() || null;
}

function cleanDate(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${field} must be a valid YYYY-MM-DD date`,
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${field} must be a valid YYYY-MM-DD date`,
    );
  }

  return date;
}

function cleanEducation(value: unknown, creating = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'body must be an object');
  }

  const body = value as Record<string, unknown>;
  return {
    title: cleanText(
      body.title,
      'title',
      creating || body.title !== undefined,
    ) as string | undefined,
    school: cleanText(body.school, 'school'),
    level: cleanText(body.level, 'level'),
    startDate: cleanDate(body.startDate, 'startDate'),
    endDate: cleanDate(body.endDate, 'endDate'),
    studyFieldId:
      body.studyFieldId === undefined || body.studyFieldId === null
        ? body.studyFieldId
        : cleanId(body.studyFieldId, 'studyFieldId'),
  };
}

function assertDateOrder(startDate?: Date | null, endDate?: Date | null) {
  if (startDate && endDate && endDate < startDate) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'endDate must not precede startDate',
    );
  }
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
  requireAuth,
  async (_request, response) => {
    const user = requireStudent(response);
    await getStudentProfile(prisma, user.id);
    const educations = await prisma.studentEducation.findMany({
      where: { studentId: user.id },
      include: educationInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    response.status(200).json(educations);
  },
);

studentEducationsRouter.post(
  '/student-educations',
  requireAuth,
  async (request, response) => {
    const user = requireStudent(response);
    const data = cleanEducation(request.body ?? {}, true);
    assertDateOrder(data.startDate, data.endDate);

    const education = await prisma.$transaction(async (tx) => {
      await lockStudentProfile(tx, user.id);
      await assertStudyField(tx, data.studyFieldId);
      const created = await tx.studentEducation.create({
        data: { ...data, title: data.title!, studentId: user.id },
        include: educationInclude,
      });
      await unpublishStudentProfile(tx, user.id);

      return created;
    });

    response.status(201).json(education);
  },
);

studentEducationsRouter.patch(
  '/student-educations/:educationId',
  requireAuth,
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
        include: educationInclude,
      });
      await removeIneligibleSpecialties(tx, user.id, profile.domainId);
      await unpublishStudentProfile(tx, user.id);

      return updated;
    });

    response.status(200).json(education);
  },
);

studentEducationsRouter.delete(
  '/student-educations/:educationId',
  requireAuth,
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
