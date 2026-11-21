import { authPaths } from '@/modules/auth/openapi';
import { profilesPaths } from '@/modules/profiles/openapi';
import { catalogPaths } from '@/modules/catalog/openapi';
import { studentsPaths } from '@/modules/students/openapi';
import { adminUsersPaths } from '@/modules/admin-users/openapi';

export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Epolia API',
    version: '1.0.0',
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Check API health',
        tags: ['Health'],
        responses: {
          200: { description: 'API is running' },
        },
      },
    },
    ...authPaths,
    ...profilesPaths,
    ...catalogPaths,
    ...studentsPaths,
    ...adminUsersPaths,
  },
  components: {
    parameters: {
      UserId: {
        name: 'userId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      DomainId: {
        name: 'domainId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      SpecialtyId: {
        name: 'specialtyId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
      EducationId: {
        name: 'educationId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    },
    schemas: {
      EducationCampus: {
        type: 'object',
        required: ['id', 'label', 'city', 'address'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          city: { type: 'string' },
          address: {
            type: 'string',
            nullable: true,
            description: 'Campus street address from the education directory',
          },
        },
      },
      EducationOffer: {
        type: 'object',
        required: [
          'id',
          'campusId',
          'campusLabel',
          'label',
          'detail',
          'level',
          'studyFieldId',
        ],
        properties: {
          id: { type: 'string' },
          campusId: { type: 'string' },
          campusLabel: { type: 'string' },
          detail: {
            type: 'string',
            nullable: true,
            description:
              'Duration and attendance mode where known; includes the source reference for otherwise identical options',
          },
          label: { type: 'string' },
          level: { type: 'string', nullable: true },
          studyFieldId: { type: 'string', format: 'uuid', nullable: true },
        },
      },
      EducationServicePreview: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'description'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' },
        },
      },
      EducationServiceCandidate: {
        additionalProperties: false,
        type: 'object',
        required: [
          'id',
          'reference',
          'label',
          'description',
          'family',
          'studyDomain',
          'otherStudyDomain',
          'trainingExamples',
        ],
        properties: {
          id: { type: 'string' },
          reference: { type: 'integer' },
          family: { type: 'string' },
          studyDomain: { type: 'string' },
          otherStudyDomain: { type: 'string', nullable: true },
          trainingExamples: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' },
        },
      },
      StudyField: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          label: { type: 'string', example: 'Mathematiques et statistiques' },
        },
      },
      EligibleSpecialty: {
        type: 'object',
        required: ['id', 'label', 'domainId', 'domain'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          label: { type: 'string', example: 'Site vitrine' },
          domainId: { type: 'string', format: 'uuid' },
          domain: { $ref: '#/components/schemas/StudyField' },
        },
      },
      StudentEducationInput: {
        allOf: [
          { $ref: '#/components/schemas/StudentEducationUpdate' },
          {
            anyOf: [
              { type: 'object', required: ['title'] },
              {
                type: 'object',
                required: ['catalogOfferId'],
                properties: {
                  catalogOfferId: { type: 'string', minLength: 1 },
                },
              },
            ],
          },
        ],
      },
      StudentEducationUpdate: {
        type: 'object',
        properties: {
          catalogOfferId: {
            type: 'string',
            nullable: true,
            maxLength: 255,
            description:
              'Opaque offer ID for a catalog selection. Send null and a title for a free declaration. For a catalog offer send only the ID and personal dates. Omitting this property on a PATCH preserves the current entry mode.',
          },
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 150,
            example: 'Licence informatique',
          },
          school: {
            type: 'string',
            nullable: true,
            maxLength: 150,
            example: 'Universite Paris Cite',
          },
          level: {
            type: 'string',
            nullable: true,
            maxLength: 150,
            example: 'BAC+3',
          },
          startDate: {
            type: 'string',
            format: 'date',
            nullable: true,
            example: '2025-09-01',
          },
          endDate: {
            type: 'string',
            format: 'date',
            nullable: true,
            example: '2028-06-30',
          },
          studyFieldId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Official study field; null grants no specialty',
          },
        },
      },
      StudentEducation: {
        allOf: [
          { $ref: '#/components/schemas/StudentEducationInput' },
          {
            type: 'object',
            required: [
              'id',
              'studentId',
              'studyFieldId',
              'source',
              'catalogCampusId',
              'catalogOfferId',
            ],
            properties: {
              id: { type: 'string', format: 'uuid' },
              studentId: { type: 'string', format: 'uuid' },
              source: { type: 'string', enum: ['LEGACY', 'MANUAL', 'CATALOG'] },
              catalogCampusId: { type: 'string', nullable: true },
              studyField: {
                allOf: [{ $ref: '#/components/schemas/StudyField' }],
                nullable: true,
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },
      StudentSpecialtyUpdate: {
        type: 'object',
        properties: {
          pricingType: { type: 'string', enum: ['HOURLY', 'FIXED'] },
          priceCents: { type: 'integer', minimum: 1, maximum: 2147483647 },
          pricingDetails: { type: 'string', nullable: true, maxLength: 500 },
        },
      },
      UserProfileInput: {
        type: 'object',
        required: ['firstName'],
        properties: {
          firstName: { type: 'string', maxLength: 100, example: 'Sabrina' },
          lastName: { type: 'string', maxLength: 100, example: 'Hammadi' },
          photoUrl: {
            type: 'string',
            maxLength: 2048,
            example: 'https://example.com/photo.jpg',
          },
          city: { type: 'string', maxLength: 100, example: 'Paris' },
          latitude: { type: 'number', example: 48.8566 },
          longitude: { type: 'number', example: 2.3522 },
        },
      },
      StudentProfileInput: {
        type: 'object',
        properties: {
          domainId: {
            type: 'string',
            format: 'uuid',
            description:
              'Omit to start a draft or to keep the currently selected domain.',
            example: '9324c24d-a476-41db-a0e3-12479bd81ed7',
          },
          title: {
            type: 'string',
            maxLength: 100,
            example: 'Developpeuse web',
          },
          description: {
            type: 'string',
            maxLength: 2000,
            example: 'Creation de sites vitrines et applications web.',
          },
          status: {
            type: 'string',
            enum: ['DRAFT'],
            description:
              'Only DRAFT is accepted. Self-service publication is blocked until education verification is implemented (#55/#70). Suspension is decided by moderation: a suspended profile keeps its status.',
            example: 'DRAFT',
          },
        },
      },
      StudentSpecialtyInput: {
        type: 'object',
        required: ['specialtyId', 'pricingType', 'priceCents'],
        properties: {
          specialtyId: {
            type: 'string',
            format: 'uuid',
            example: '472e5d8d-e7bf-4513-a812-7970ecb65e9c',
          },
          pricingType: {
            type: 'string',
            enum: ['HOURLY', 'FIXED'],
            example: 'HOURLY',
          },
          priceCents: {
            type: 'integer',
            minimum: 1,
            maximum: 2147483647,
            example: 2500,
          },
          pricingDetails: {
            type: 'string',
            nullable: true,
            maxLength: 500,
            example: 'Cours de 60 minutes',
          },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};
