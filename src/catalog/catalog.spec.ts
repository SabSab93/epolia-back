import { assertApprovedCatalog, validateCatalog } from '../../prisma/catalog';

const payload = {
  version: 2,
  domains: [{ label: 'Web', specialties: ['Site vitrine', 'Application web'] }],
  studyFields: [
    {
      label: 'Informatique',
      allowedSpecialties: [{ domain: 'Web', specialty: 'Site vitrine' }],
    },
  ],
};

describe('Catalog validation', () => {
  it('normalizes labels and resolves references without granting a full domain', () => {
    const catalog = validateCatalog({
      ...payload,
      domains: [
        { label: ' Web ', specialties: ['Site vitrine', 'Application web'] },
      ],
      studyFields: [
        {
          label: ' Informatique ',
          allowedSpecialties: [
            { domain: ' WEB ', specialty: ' site   vitrine ' },
          ],
        },
      ],
    });
    expect(catalog.studyFields[0].allowedSpecialties).toEqual([
      { domain: 'Web', specialty: 'Site vitrine' },
    ]);
  });

  it.each([
    null,
    [],
    {},
    { ...payload, version: 1 },
    { ...payload, domains: {} },
    { ...payload, studyFields: null },
  ])('rejects malformed structures: %p', (value) => {
    expect(() => validateCatalog(value)).toThrow();
  });

  it.each(['', '   ', null, 10])('rejects invalid labels: %p', (label) => {
    expect(() =>
      validateCatalog({ ...payload, domains: [{ label, specialties: [] }] }),
    ).toThrow();
  });

  it('rejects duplicate domains after normalization', () => {
    expect(() =>
      validateCatalog({
        ...payload,
        domains: [...payload.domains, { label: ' WEB ', specialties: [] }],
      }),
    ).toThrow(/Duplicate/);
  });

  it('rejects duplicate specialties after normalization', () => {
    expect(() =>
      validateCatalog({
        ...payload,
        domains: [
          { label: 'Web', specialties: ['Site vitrine', ' site   VITRINE '] },
        ],
      }),
    ).toThrow(/Duplicate/);
  });

  it('rejects duplicate study fields', () => {
    expect(() =>
      validateCatalog({
        ...payload,
        studyFields: [...payload.studyFields, ...payload.studyFields],
      }),
    ).toThrow(/Duplicate/);
  });

  it('rejects duplicate eligibility pairs', () => {
    expect(() =>
      validateCatalog({
        ...payload,
        studyFields: [
          {
            label: 'Informatique',
            allowedSpecialties: [
              ...payload.studyFields[0].allowedSpecialties,
              ...payload.studyFields[0].allowedSpecialties,
            ],
          },
        ],
      }),
    ).toThrow(/Duplicate/);
  });

  it.each([
    { domain: 'Unknown', specialty: 'Site vitrine' },
    { domain: 'Web', specialty: 'Unknown' },
  ])('rejects missing references: %p', (pair) => {
    expect(() =>
      validateCatalog({
        ...payload,
        studyFields: [{ label: 'Informatique', allowedSpecialties: [pair] }],
      }),
    ).toThrow(/Unknown/);
  });

  it('rejects canonically equivalent unicode duplicates', () => {
    expect(() =>
      validateCatalog({
        ...payload,
        domains: [{ label: 'Web', specialties: ['Caf\u00e9', 'Cafe\u0301'] }],
      }),
    ).toThrow(/Duplicate/);
  });

  it('accepts an empty approved catalog without inventing approvals', () => {
    const approved = validateCatalog({
      version: 2,
      domains: [],
      studyFields: [],
    });
    expect(() =>
      assertApprovedCatalog(validateCatalog(payload), approved),
    ).not.toThrow();
  });

  it('rejects approved associations outside the candidate', () => {
    const altered = validateCatalog({
      ...payload,
      studyFields: [
        {
          label: 'Informatique',
          allowedSpecialties: [{ domain: 'Web', specialty: 'Application web' }],
        },
      ],
    });
    expect(() =>
      assertApprovedCatalog(validateCatalog(payload), altered),
    ).toThrow(/absent/);
  });
});
