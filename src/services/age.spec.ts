import { isAdult, parseAdultBirthDate } from '@/services/age';

const today = new Date('2026-10-18T15:00:00Z');

describe('Majority using UTC civil dates', () => {
  it.each([
    undefined,
    null,
    '',
    '0000-01-01',
    18,
    '2000-2-01',
    '2000-02-30',
    '2001-02-29',
    '2026-10-19',
    '2000-01-01T00:00:00Z',
  ])('rejects invalid, absent or future dates: %p', (value) => {
    expect(() => parseAdultBirthDate(value, today)).toThrow();
  });
  it('accepts exactly eighteen and older, rejects the day before the anniversary', () => {
    expect(parseAdultBirthDate('2008-10-18', today).toISOString()).toBe(
      '2008-10-18T00:00:00.000Z',
    );
    expect(parseAdultBirthDate('2000-02-29', today)).toBeInstanceOf(Date);
    expect(() => parseAdultBirthDate('2008-10-19', today)).toThrow(
      'at least 18',
    );
  });
  it('uses March 1 for February 29 births in non-leap years', () => {
    const birth = new Date('2008-02-29T00:00:00Z');
    expect(isAdult(birth, new Date('2026-02-28T23:59:59Z'))).toBe(false);
    expect(isAdult(birth, new Date('2026-03-01T00:00:00Z'))).toBe(true);
  });
  it('does not round a non-existent cutoff date up on February 29', () => {
    expect(isAdult(new Date('2006-03-01'), new Date('2024-02-29'))).toBe(false);
    expect(isAdult(new Date('2006-02-28'), new Date('2024-02-29'))).toBe(true);
  });
  it('changes eligibility at UTC midnight, irrespective of the input offset', () => {
    const birth = new Date('2008-10-18');
    expect(isAdult(birth, new Date('2026-10-18T01:59:59+02:00'))).toBe(false);
    expect(isAdult(birth, new Date('2026-10-18T02:00:00+02:00'))).toBe(true);
  });
});
