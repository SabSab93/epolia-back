const directoryId = (name: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', maxLength: 255 },
});
const directoryList = (name: string) => ({
  'application/json': {
    schema: { type: 'array', items: { $ref: '#/components/schemas/' + name } },
  },
});
const directoryUnavailable = {
  description:
    'EDUCATION_CATALOG_UNAVAILABLE: directory temporarily unavailable',
};

export const catalogPaths = {
  '/api/education-catalog/campuses': {
    get: {
      tags: ['Catalog'],
      summary: 'Search campuses by school name or city',
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: true,
          schema: { type: 'string', minLength: 2, maxLength: 100 },
        },
      ],
      responses: {
        200: {
          description: 'Up to 40 matching campuses, or an empty list',
          content: directoryList('EducationCampus'),
        },
        400: { description: 'Invalid search term' },
        503: directoryUnavailable,
      },
    },
  },
  '/api/education-catalog/campuses/{campusId}/offers': {
    get: {
      tags: ['Catalog'],
      summary: 'List the offers of one campus',
      parameters: [directoryId('campusId')],
      responses: {
        200: {
          description: 'Offer list, possibly empty',
          content: directoryList('EducationOffer'),
        },
        400: { description: 'Invalid campus ID' },
        404: { description: 'Unknown campus' },
        503: directoryUnavailable,
      },
    },
  },
  '/api/education-catalog/offers/{offerId}/candidates': {
    get: {
      tags: ['Catalog'],
      summary: 'Preview candidate services reviewed for this specific offer',
      description:
        'Editorial suggestions only. These IDs cannot be used to activate a student specialty.',
      parameters: [directoryId('offerId')],
      responses: {
        200: {
          description: 'Suggestions for this offer, possibly empty',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['offerId', 'candidates'],
                properties: {
                  offerId: { type: 'string' },
                  candidates: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/EducationServiceCandidate',
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Invalid offer ID' },
        404: { description: 'Unknown offer' },
        503: directoryUnavailable,
      },
    },
  },
  '/api/domains': {
    get: {
      summary: 'List catalog domains',
      tags: ['Catalog'],
      responses: {
        200: { description: 'Catalog domains' },
      },
    },
  },
  '/api/domains/{domainId}/specialties': {
    get: {
      summary: 'List specialties for a catalog domain',
      tags: ['Catalog'],
      parameters: [{ $ref: '#/components/parameters/DomainId' }],
      responses: {
        200: { description: 'Domain specialties' },
        400: { description: 'Validation error' },
        404: { description: 'Domain not found' },
      },
    },
  },
  '/api/study-fields': {
    get: {
      summary: 'List official study fields',
      tags: ['Catalog'],
      responses: {
        200: {
          description:
            'Study fields ordered by label; no proof of qualification',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/StudyField' },
              },
            },
          },
        },
      },
    },
  },
};
