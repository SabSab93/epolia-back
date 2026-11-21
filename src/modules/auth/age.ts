import { AppError } from '@/errors/app-error';

export function isAdult(birthDate: Date | null | undefined, at = new Date()) {
  if (!birthDate || !Number.isFinite(birthDate.getTime())) return false;
  const years = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const anniversaryReached =
    at.getUTCMonth() > birthDate.getUTCMonth() ||
    (at.getUTCMonth() === birthDate.getUTCMonth() &&
      at.getUTCDate() >= birthDate.getUTCDate());
  return years > 18 || (years === 18 && anniversaryReached);
}

export function assertAdult(birthDate: Date | null | undefined) {
  if (!birthDate)
    throw new AppError(403, 'BIRTH_DATE_REQUIRED', 'Birth date is required');
  if (!isAdult(birthDate))
    throw new AppError(
      403,
      'ADULT_REQUIRED',
      'You must be at least 18 years old',
    );
}

export function parseAdultBirthDate(value: unknown, at = new Date()) {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
    value.startsWith('0000-')
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'birthDate must be a valid YYYY-MM-DD civil date',
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  const today = at.toISOString().slice(0, 10);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value > today
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'birthDate must be a valid non-future civil date',
    );
  }
  if (!isAdult(date, at))
    throw new AppError(
      403,
      'ADULT_REQUIRED',
      'You must be at least 18 years old',
    );
  return date;
}
