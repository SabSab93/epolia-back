import { Prisma, ProfileStatus } from '@prisma/client';
import { AppError } from '@/errors/app-error';

export async function getStudentProfile(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  const profile = await tx.studentProfile.findUnique({
    where: { userId: studentId },
  });

  if (!profile) {
    throw new AppError(
      404,
      'STUDENT_PROFILE_NOT_FOUND',
      'Student profile not found',
    );
  }

  return profile;
}

export async function lockStudentProfile(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  // Serialize education, domain and specialty changes for the same student.
  await tx.$queryRaw`
    SELECT user_id FROM student_profiles
    WHERE user_id = ${studentId}::uuid FOR UPDATE
  `;

  return getStudentProfile(tx, studentId);
}

export function eligibleSpecialtyWhere(
  studentId: string,
  domainId?: string,
): Prisma.SpecialtyWhereInput {
  return {
    domainId,
    studyFields: {
      some: {
        studyField: { educations: { some: { studentId } } },
      },
    },
  };
}

export async function assertSpecialtyEligible(
  tx: Prisma.TransactionClient,
  studentId: string,
  specialtyId: string,
) {
  const education = await tx.studentEducation.findFirst({
    where: {
      studentId,
      studyField: { specialties: { some: { specialtyId } } },
    },
    select: { id: true },
  });

  if (!education) {
    throw new AppError(
      403,
      'SPECIALTY_NOT_ELIGIBLE',
      'Specialty is not allowed by any of your educations',
    );
  }
}

export async function removeIneligibleSpecialties(
  tx: Prisma.TransactionClient,
  studentId: string,
  domainId: string,
) {
  return tx.studentSpecialty.deleteMany({
    where: {
      studentId,
      specialty: { NOT: eligibleSpecialtyWhere(studentId, domainId) },
    },
  });
}

export async function unpublishStudentProfile(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  await tx.studentProfile.updateMany({
    where: { userId: studentId, status: ProfileStatus.VISIBLE },
    data: { status: ProfileStatus.DRAFT },
  });
}
