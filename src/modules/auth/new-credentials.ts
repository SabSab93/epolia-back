import { AppError } from '@/errors/app-error';
import { minPasswordLength } from '@/modules/auth/password';
import { emailRegex } from '@/validation/input-formats';
import { assertMaxLength, maxLength } from '@/validation/input-limits';

export function readNewCredentials(email: unknown, password: unknown) {
  // Lengths first: the e-mail regex must never run on a huge input.
  assertMaxLength(email, 'email', maxLength.email);
  assertMaxLength(password, 'password', maxLength.password);

  if (
    typeof email !== 'string' ||
    !emailRegex.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < minPasswordLength
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'email and password with at least 8 characters are required',
    );
  }
  return { email: email.trim().toLowerCase(), password };
}
