import { AppError } from '@/errors/app-error';
import { uuidRegex } from '@/validation/input-formats';
import { assertMaxLength, maxLength } from '@/validation/input-limits';

export function readPageValue(
  value: unknown,
  field: string,
  min: number,
  max: number,
) {
  if (value === undefined) return undefined;

  const parsed =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} is invalid`);
  }

  return parsed;
}

export function cleanId(value: unknown, field: string) {
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

export function cleanEducation(value: unknown, creating = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'body must be an object');
  }

  const body = value as Record<string, unknown>;
  assertMaxLength(body.title, 'title', maxLength.educationText);
  assertMaxLength(body.school, 'school', maxLength.educationText);
  assertMaxLength(body.level, 'level', maxLength.educationText);
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

export function assertDateOrder(
  startDate?: Date | null,
  endDate?: Date | null,
) {
  if (startDate && endDate && endDate < startDate) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'endDate must not precede startDate',
    );
  }
}
