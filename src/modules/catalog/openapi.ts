export const catalogPaths = {
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
