import { AppError } from '@/errors/app-error';
import { assertMaxLength, assertPhone } from '@/services/input-limits';

describe('input limits', () => {
  it('accepts a text at the maximum length, once trimmed', () => {
    expect(() =>
      assertMaxLength(` ${'a'.repeat(10)} `, 'title', 10),
    ).not.toThrow();
  });

  it('refuses a text over the maximum length', () => {
    expect(() => assertMaxLength('a'.repeat(11), 'title', 10)).toThrow(
      new AppError(
        400,
        'VALIDATION_ERROR',
        'title must be at most 10 characters',
      ),
    );
  });

  it('ignores values that are not strings', () => {
    expect(() => assertMaxLength(undefined, 'title', 10)).not.toThrow();
    expect(() => assertMaxLength(null, 'title', 10)).not.toThrow();
  });

  it.each([
    '+33612345678',
    '06 12 34 56 78',
    '06.12.34.56.78',
    '06-12-34-56-78',
  ])('accepts the phone number %s', (phone) => {
    expect(() => assertPhone(phone)).not.toThrow();
  });

  it.each([
    'abc',
    '12',
    '+33 6 12 34 56 78 90 12 34',
    '06 12 34 56 78 ',
    '<script>',
  ])('refuses the phone number %j', (phone) => {
    expect(() => assertPhone(phone)).toThrow('phone is invalid');
  });
});
