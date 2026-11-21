export const studentsPaths = {
  '/api/student-profiles': {
    post: {
      summary: 'Create the authenticated student profile',
      description:
        'Omit domainId to create a private draft before recording educations. If a draft already exists, resume it with GET /api/student-profiles/me.',
      tags: ['StudentProfile'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/StudentProfileInput' },
          },
        },
      },
      responses: {
        201: {
          description:
            'Student profile created. domainId is null when omitted.',
        },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Forbidden or status not allowed' },
        409: { description: 'Student profile already exists' },
      },
    },
  },
  '/api/student-profiles/me': {
    get: {
      summary: 'Get the authenticated student profile',
      tags: ['StudentProfile'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description:
            'Authenticated student profile found. domainId may be null.',
        },
        401: { description: 'Authentication required' },
        403: { description: 'Forbidden' },
        404: { description: 'Student profile not found' },
      },
    },
    patch: {
      summary: 'Update the authenticated student profile',
      tags: ['StudentProfile'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/StudentProfileInput' },
          },
        },
      },
      responses: {
        200: { description: 'Student profile updated' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: {
          description:
            'Forbidden, status not allowed, or status change on a suspended profile',
        },
        404: { description: 'Student profile not found' },
      },
    },
  },
  '/api/users/{userId}/student-profile': {
    get: {
      summary: 'Get a student profile by user id',
      tags: ['StudentProfile'],
      parameters: [{ $ref: '#/components/parameters/UserId' }],
      responses: {
        200: { description: 'Student profile found' },
        400: { description: 'Invalid userId' },
        404: {
          description:
            'Profile absent, owner inactive, not visible, unverified or with ineligible specialties',
        },
      },
    },
  },
  '/api/student-specialties/me': {
    get: {
      summary: 'List authenticated student specialties',
      tags: ['StudentSpecialty'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Student specialties' },
        401: { description: 'Authentication required' },
        403: { description: 'Forbidden' },
        404: { description: 'Student profile not found' },
      },
    },
  },
  '/api/student-specialties/eligible': {
    get: {
      summary:
        'List specialties allowed by current educations and principal domain',
      tags: ['StudentSpecialty'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description:
            'Exact union of linked study field specialties. Before a principal domain is selected, use these results to suggest domains. Once selected, results are filtered by that domain.',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/EligibleSpecialty' },
              },
            },
          },
        },
        401: { description: 'Authentication required' },
        403: { description: 'Student role required' },
        404: { description: 'Student profile not found' },
      },
    },
  },
  '/api/student-educations/me': {
    get: {
      summary: 'List authenticated student educations',
      description:
        'Most recent start date first. Undated educations appear last. Without pagination parameters, all owned educations are returned.',
      tags: ['StudentEducation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100 },
        },
        {
          name: 'offset',
          in: 'query',
          schema: { type: 'integer', minimum: 0, maximum: 2147483647 },
        },
      ],
      responses: {
        200: {
          description:
            'Educations, including historical rows with a null studyFieldId',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/StudentEducation' },
              },
            },
          },
        },
        400: { description: 'Invalid pagination parameters' },
        401: { description: 'Authentication required' },
        403: { description: 'Student role required' },
        404: { description: 'Student profile not found' },
      },
    },
  },
  '/api/student-educations': {
    post: {
      summary: 'Declare an education for the authenticated student',
      description:
        'Catalog selections store server-resolved labels and family. A free directory declaration (catalogOfferId: null) grants no specialty. Older clients can still declare an explicit family. Eligibility requires a study field and both dates covering today (UTC civil date, inclusive). Incomplete, past or future educations grant no eligibility. A new education returns a visible profile to DRAFT.',
      tags: ['StudentEducation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description:
            'Generate one UUID per new education and reuse it when retrying the same creation. Replays return the existing education without changing it while it exists. Use PATCH to edit an education.',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/StudentEducationInput' },
          },
        },
      },
      responses: {
        200: {
          description: 'Existing education returned for a replay',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StudentEducation' },
            },
          },
        },
        201: {
          description: 'Education declared, not verified',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StudentEducation' },
            },
          },
        },
        400: {
          description: 'Invalid title, studyFieldId, dates or idempotency key',
        },
        401: { description: 'Authentication required' },
        403: { description: 'Student role required' },
        404: {
          description:
            'Student profile, catalog offer or study field not found',
        },
        503: { description: 'Education directory unavailable' },
        409: {
          description:
            'EDUCATION_LIMIT_REACHED: a student can have at most 20 educations',
        },
      },
    },
  },
  '/api/student-educations/{educationId}': {
    patch: {
      summary:
        'Update an owned education and remove ineligible profile specialties',
      description:
        'Catalog labels and family are server-controlled. Date-only edits work after retirement. To replace the selection send another offer ID, or catalogOfferId: null and a title to switch to a free declaration.',
      tags: ['StudentEducation'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/EducationId' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/StudentEducationUpdate' },
          },
        },
      },
      responses: {
        200: {
          description:
            'Education updated atomically; mission snapshots unchanged',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StudentEducation' },
            },
          },
        },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Student role required' },
        404: {
          description:
            'Owned education, student profile, catalog offer or study field not found',
        },
        503: { description: 'Education directory unavailable' },
      },
    },
    delete: {
      summary:
        'Delete an owned education and remove ineligible profile specialties',
      tags: ['StudentEducation'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/EducationId' }],
      responses: {
        204: {
          description:
            'Education removed atomically; mission snapshots unchanged',
        },
        400: { description: 'Invalid educationId' },
        401: { description: 'Authentication required' },
        403: { description: 'Student role required' },
        404: { description: 'Owned education or student profile not found' },
      },
    },
  },
  '/api/student-specialties': {
    post: {
      summary: 'Add a specialty to the authenticated student profile',
      description:
        'Requires a compatible principal domain and an explicit study field link from a current owned education (both dates required, inclusive UTC civil dates). New offerings return visible profiles to DRAFT.',
      tags: ['StudentSpecialty'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/StudentSpecialtyInput' },
          },
        },
      },
      responses: {
        201: { description: 'Student specialty created' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: {
          description: 'Student role or education eligibility required',
        },
        404: { description: 'Student profile or specialty not found' },
        409: { description: 'Student specialty already exists' },
      },
    },
  },
  '/api/student-specialties/{specialtyId}': {
    patch: {
      summary: 'Update authenticated student specialty pricing',
      description:
        'Education eligibility and principal domain compatibility are rechecked on every update.',
      tags: ['StudentSpecialty'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/SpecialtyId' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/StudentSpecialtyUpdate' },
          },
        },
      },
      responses: {
        200: { description: 'Student specialty updated' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: {
          description: 'Student role or education eligibility required',
        },
        404: { description: 'Student specialty not found' },
      },
    },
    delete: {
      summary: 'Remove a specialty from the authenticated student profile',
      tags: ['StudentSpecialty'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/SpecialtyId' }],
      responses: {
        204: { description: 'Student specialty removed' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Forbidden' },
      },
    },
  },
};
