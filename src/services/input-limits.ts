import { AppError } from '@/errors/app-error';

// Maximum length of each free-text field, in characters. Without them, every
// field accepted up to the JSON body limit (1 MB).
export const maxLength = {
  email: 254, // longest valid e-mail address (RFC 5321)
  password: 128,
  name: 100, // first name, last name
  city: 100,
  phone: 20,
  photoUrl: 2048,
  profileTitle: 100,
  profileDescription: 2000,
  educationText: 150, // education title, school, level
  pricingDetails: 500,
} as const;

export const maxEducationsPerStudent = 20;

// Digits with an optional leading +, and spaces, dots or dashes between them.
const phoneRegex = /^\+?[0-9][0-9 .-]{4,18}[0-9]$/;

export function assertMaxLength(
  value: unknown,
  field: string,
  max: number,
): void {
  // Measured once trimmed, as the value is stored.
  if (typeof value === 'string' && value.trim().length > max) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${field} must be at most ${max} characters`,
    );
  }
}

export function assertPhone(value: string): void {
  if (!phoneRegex.test(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'phone is invalid');
  }
}
