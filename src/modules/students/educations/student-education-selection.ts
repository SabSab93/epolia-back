import type { Prisma, StudentEducation } from '@prisma/client';
import { AppError } from '@/errors/app-error';
import { requireCatalogOffer } from '@/modules/catalog/education-directory-access';
import type { cleanEducation } from '@/modules/students/educations/student-educations-input';

type EducationChanges = Partial<
  Pick<
    StudentEducation,
    | 'title'
    | 'school'
    | 'level'
    | 'startDate'
    | 'endDate'
    | 'studyFieldId'
    | 'catalogOfferId'
    | 'catalogCampusId'
    | 'source'
  >
>;

export async function educationChanges(
  tx: Prisma.TransactionClient,
  input: ReturnType<typeof cleanEducation>,
  existing?: Pick<StudentEducation, 'source' | 'catalogOfferId'>,
): Promise<EducationChanges> {
  const { catalogOfferId, ...fields } = input;
  const source =
    catalogOfferId === undefined
      ? (existing?.source ?? 'LEGACY')
      : catalogOfferId === null
        ? 'MANUAL'
        : 'CATALOG';

  // The original API accepts an explicitly chosen family. The new flow
  // resolves the family from the selected offer and keeps free entries unlinked.
  if (source === 'LEGACY') return fields;
  if (fields.studyFieldId != null) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Study field cannot be assigned to this declaration',
    );
  }
  if (source === 'MANUAL') {
    const leavingCatalog = existing?.source === 'CATALOG';
    if (leavingCatalog && !fields.title) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'title is required for a manual declaration',
      );
    }
    return {
      ...fields,
      school: leavingCatalog ? (fields.school ?? null) : fields.school,
      level: leavingCatalog ? (fields.level ?? null) : fields.level,
      studyFieldId: null,
      catalogOfferId: null,
      catalogCampusId: null,
      source,
    };
  }

  if (
    fields.title !== undefined ||
    fields.school !== undefined ||
    fields.level !== undefined
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Catalog education labels are set by the directory',
    );
  }
  const dates = { startDate: fields.startDate, endDate: fields.endDate };
  // Editing personal dates does not depend on today's directory. Previously
  // selected offers stay readable and editable after a retirement or a rename.
  if (!catalogOfferId || existing?.catalogOfferId === catalogOfferId)
    return dates;

  const offer = await requireCatalogOffer(catalogOfferId, tx);
  return {
    ...dates,
    source,
    catalogOfferId: offer.id,
    catalogCampusId: offer.campusId,
    title: offer.label,
    school: offer.campusLabel,
    level: offer.level ?? null,
    studyFieldId: offer.studyFieldId ?? null,
  };
}
