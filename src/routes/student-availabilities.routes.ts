import { Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';
import {
  getStudentProfile,
  lockStudentProfile,
} from '@/services/student-specialties';

export const studentAvailabilitiesRouter = Router();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instantPattern =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function requireStudent(response: { locals: { authUser?: AuthUser } }) {
  const user = response.locals.authUser as AuthUser;
  if (!user.roles.includes(UserRole.STUDENT)) {
    throw new AppError(403, 'FORBIDDEN', 'Student role required');
  }

  return user;
}

function parseInstant(value: unknown, field: string) {
  const match = typeof value === 'string' ? instantPattern.exec(value) : null;
  if (match) {
    const day = new Date(`${match[1]}T00:00:00Z`);
    const instant = new Date(match[0]);
    if (
      Number.isFinite(day.getTime()) &&
      day.toISOString().slice(0, 10) === match[1] &&
      Number.isFinite(instant.getTime())
    ) {
      return instant;
    }
  }

  throw new AppError(
    400,
    'VALIDATION_ERROR',
    `${field} must be an ISO date-time with a timezone offset`,
  );
}

function assertInterval(start: Date, end: Date) {
  if (start >= end) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'The end must be after the start',
    );
  }
}

function parseAvailabilityId(id: unknown) {
  if (typeof id !== 'string' || !uuidPattern.test(id)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'availabilityId is invalid');
  }
  return id;
}

function availabilityNotFound() {
  return new AppError(404, 'AVAILABILITY_NOT_FOUND', 'Availability not found');
}

async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  studentId: string,
  startsAt: Date,
  endsAt: Date,
  excludedId?: string,
) {
  const conflict = await tx.studentAvailability.findFirst({
    where: {
      studentId,
      id: excludedId ? { not: excludedId } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });

  if (conflict) {
    throw new AppError(
      409,
      'AVAILABILITY_OVERLAP',
      'Availability overlaps an existing slot',
    );
  }
}

studentAvailabilitiesRouter.get(
  '/student-availabilities/me',
  requireAuth,
  async (request, response) => {
    const { id: studentId } = requireStudent(response);
    const from = parseInstant(request.query.from, 'from');
    const to = parseInstant(request.query.to, 'to');
    assertInterval(from, to);

    await getStudentProfile(prisma, studentId);
    const slots = await prisma.studentAvailability.findMany({
      where: { studentId, startsAt: { lt: to }, endsAt: { gt: from } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });

    response.status(200).json(slots);
  },
);

studentAvailabilitiesRouter.post(
  '/student-availabilities/me',
  requireAuth,
  async (request, response) => {
    const { id: studentId } = requireStudent(response);
    const startsAt = parseInstant(request.body?.startsAt, 'startsAt');
    const endsAt = parseInstant(request.body?.endsAt, 'endsAt');
    assertInterval(startsAt, endsAt);

    const slot = await prisma.$transaction(async (tx) => {
      await lockStudentProfile(tx, studentId);
      await assertNoOverlap(tx, studentId, startsAt, endsAt);
      return tx.studentAvailability.create({
        data: { studentId, startsAt, endsAt },
      });
    });

    response.status(201).json(slot);
  },
);

studentAvailabilitiesRouter.patch(
  '/student-availabilities/:availabilityId',
  requireAuth,
  async (request, response) => {
    const { id: studentId } = requireStudent(response);
    const id = parseAvailabilityId(request.params.availabilityId);
    const body = request.body;
    if (body?.startsAt === undefined && body?.endsAt === undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Provide startsAt or endsAt');
    }
    const start =
      body.startsAt === undefined
        ? undefined
        : parseInstant(body.startsAt, 'startsAt');
    const end =
      body.endsAt === undefined
        ? undefined
        : parseInstant(body.endsAt, 'endsAt');

    const slot = await prisma.$transaction(async (tx) => {
      await lockStudentProfile(tx, studentId);
      const existing = await tx.studentAvailability.findFirst({
        where: { id, studentId },
      });
      if (!existing) throw availabilityNotFound();

      const startsAt = start ?? existing.startsAt;
      const endsAt = end ?? existing.endsAt;
      assertInterval(startsAt, endsAt);
      await assertNoOverlap(tx, studentId, startsAt, endsAt, id);

      return tx.studentAvailability.update({
        where: { id },
        data: { startsAt, endsAt },
      });
    });

    response.status(200).json(slot);
  },
);

studentAvailabilitiesRouter.delete(
  '/student-availabilities/:availabilityId',
  requireAuth,
  async (request, response) => {
    const { id: studentId } = requireStudent(response);
    const id = parseAvailabilityId(request.params.availabilityId);
    await prisma.$transaction(async (tx) => {
      await lockStudentProfile(tx, studentId);
      const deleted = await tx.studentAvailability.deleteMany({
        where: { id, studentId },
      });
      if (!deleted.count) throw availabilityNotFound();
    });

    response.sendStatus(204);
  },
);
