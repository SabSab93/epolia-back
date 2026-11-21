import { PricingType } from '@prisma/client';
import { AppError } from '@/errors/app-error';
import { uuidRegex } from '@/validation/input-formats';
import { assertMaxLength, maxLength } from '@/validation/input-limits';

export function cleanSpecialtyId(value: unknown, isRequired: true): string;
export function cleanSpecialtyId(
  value: unknown,
  isRequired?: false,
): string | undefined;
export function cleanSpecialtyId(value: unknown, isRequired = false) {
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

export function cleanPricingType(value: unknown, isRequired: true): PricingType;
export function cleanPricingType(
  value: unknown,
  isRequired?: false,
): PricingType | undefined;
export function cleanPricingType(value: unknown, isRequired = false) {
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

export function cleanPriceCents(value: unknown, isRequired: true): number;
export function cleanPriceCents(
  value: unknown,
  isRequired?: false,
): number | undefined;
export function cleanPriceCents(value: unknown, isRequired = false) {
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

export function cleanPricingDetails(value: unknown) {
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
  assertMaxLength(value, 'pricingDetails', maxLength.pricingDetails);

  return value.trim() || null;
}
