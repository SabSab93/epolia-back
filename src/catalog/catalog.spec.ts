import { validateCatalog, validateActiveCatalog } from '@root/prisma/catalog';

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
});

const activePayload = {
  version: 3,
  domains: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      label: 'Web',
      specialties: [
        { id: '20000000-0000-4000-8000-000000000002', label: 'Site vitrine' },
      ],
    },
  ],
  studyFields: [
    {
      id: '20000000-0000-4000-8000-000000000003',
      label: 'Informatique',
      allowedSpecialtyIds: ['20000000-0000-4000-8000-000000000002'],
    },
  ],
};

describe('Active catalog with stable UUIDs', () => {
  it('accepts an empty active catalog', () => {
    expect(
      validateActiveCatalog({ version: 3, domains: [], studyFields: [] }),
    ).toEqual({ version: 3, domains: [], studyFields: [] });
  });

  it('accepts new catalog content without depending on the archived V2 labels', () => {
    const expanded = structuredClone(activePayload);
    expanded.domains[0].specialties.push({
      id: '20000000-0000-4000-8000-000000000004',
      label: 'Nouvelle prestation',
    });
    expanded.studyFields[0].allowedSpecialtyIds.push(
      '20000000-0000-4000-8000-000000000004',
    );
    expect(
      validateActiveCatalog(expanded).studyFields[0].allowedSpecialtyIds,
    ).toHaveLength(2);
  });

  it('keeps references valid after renaming domain, specialty and study field', () => {
    const renamed = structuredClone(activePayload);
    renamed.domains[0].label = ' Développement web ';
    renamed.domains[0].specialties[0].label = 'Création de site';
    renamed.studyFields[0].label = 'Licence informatique';
    expect(
      validateActiveCatalog(renamed).studyFields[0].allowedSpecialtyIds,
    ).toEqual(activePayload.studyFields[0].allowedSpecialtyIds);
  });

  it.each([
    { ...activePayload, version: 2 },
    { ...activePayload, domains: [{ ...activePayload.domains[0], id: 'web' }] },
    {
      ...activePayload,
      studyFields: [
        { ...activePayload.studyFields[0], allowedSpecialtyIds: ['unknown'] },
      ],
    },
    {
      ...activePayload,
      studyFields: [
        { ...activePayload.studyFields[0], allowedSpecialtyIds: [null] },
      ],
    },
    {
      ...activePayload,
      studyFields: [
        {
          ...activePayload.studyFields[0],
          allowedSpecialtyIds: [
            ...activePayload.studyFields[0].allowedSpecialtyIds,
            ...activePayload.studyFields[0].allowedSpecialtyIds,
          ],
        },
      ],
    },
    {
      ...activePayload,
      studyFields: [
        { ...activePayload.studyFields[0], id: activePayload.domains[0].id },
      ],
    },
    {
      ...activePayload,
      domains: [
        {
          ...activePayload.domains[0],
          specialties: [
            ...activePayload.domains[0].specialties,
            {
              id: '20000000-0000-4000-8000-000000000004',
              label: ' SITE  VITRINE ',
            },
          ],
        },
      ],
    },
  ])('rejects invalid IDs, references or duplicate identities: %p', (value) => {
    expect(() => validateActiveCatalog(value)).toThrow();
  });
});
