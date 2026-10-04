export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Epolia API',
    version: '1.0.0',
  },
  paths: {
    '/api/v1/health': {
      get: {
        summary: 'Check API health',
        tags: ['Health'],
        responses: {
          200: { description: 'API is running' },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'Register a local user',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'user@example.com' },
                  password: { type: 'string', example: 'password123' },
                  role: {
                    type: 'string',
                    enum: ['STUDENT', 'CUSTOMER'],
                    example: 'CUSTOMER',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered' },
          400: { description: 'Validation error' },
          409: { description: 'Email already used' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Login with email and password',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'user@example.com' },
                  password: { type: 'string', example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'User logged in' },
          400: { description: 'Validation error' },
          401: { description: 'Invalid email or password' },
          403: { description: 'Account is not active' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        summary: 'Return the authenticated user',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Authenticated user' },
          401: { description: 'Authentication required' },
          403: { description: 'Account is not active' },
        },
      },
    },
    '/api/v1/user-profiles': {
      post: {
        summary: 'Create the authenticated user profile',
        tags: ['UserProfile'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserProfileInput' },
            },
          },
        },
        responses: {
          201: { description: 'Profile created' },
          400: { description: 'Validation error' },
          401: { description: 'Authentication required' },
          409: { description: 'Profile already exists' },
        },
      },
    },
    '/api/v1/user-profiles/me': {
      get: {
        summary: 'Get the authenticated user profile',
        tags: ['UserProfile'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Authenticated user profile found' },
          401: { description: 'Authentication required' },
          404: { description: 'Profile not found' },
        },
      },
      patch: {
        summary: 'Update the authenticated user profile',
        tags: ['UserProfile'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserProfileInput' },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated' },
          400: { description: 'Validation error' },
          401: { description: 'Authentication required' },
          404: { description: 'Profile not found' },
        },
      },
      delete: {
        summary: 'Delete the authenticated user profile',
        tags: ['UserProfile'],
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Profile deleted' },
          401: { description: 'Authentication required' },
          404: { description: 'Profile not found' },
        },
      },
    },
    '/api/v1/users/{userId}/profile': {
      get: {
        summary: 'Get a public user profile by user id',
        tags: ['UserProfile'],
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: {
          200: { description: 'Public profile found' },
          404: { description: 'Profile not found' },
        },
      },
    },
    '/api/v1/student-profiles': {
      post: {
        summary: 'Create the authenticated student profile',
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
          201: { description: 'Student profile created' },
          400: { description: 'Validation error' },
          401: { description: 'Authentication required' },
          403: { description: 'Forbidden' },
          409: { description: 'Student profile already exists' },
        },
      },
    },
    '/api/v1/student-profiles/me': {
      get: {
        summary: 'Get the authenticated student profile',
        tags: ['StudentProfile'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Authenticated student profile found' },
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
          403: { description: 'Forbidden' },
          404: { description: 'Student profile not found' },
        },
      },
    },
    '/api/v1/users/{userId}/student-profile': {
      get: {
        summary: 'Get a student profile by user id',
        tags: ['StudentProfile'],
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: {
          200: { description: 'Student profile found' },
          404: { description: 'Student profile not found' },
        },
      },
    },
    '/api/v1/users/local': {
      post: {
        summary: 'Create a local user',
        tags: ['UsersAdmin'],
        security: [{ bearerAuth: [] }],
        responses: {
          201: { description: 'User created' },
          400: { description: 'Validation error' },
          403: { description: 'Admin role required' },
        },
      },
    },
    '/api/v1/users/{userId}/roles': {
      post: {
        summary: 'Assign a role to a user',
        tags: ['UsersAdmin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: {
          200: { description: 'Role assigned' },
          400: { description: 'Validation error' },
          403: { description: 'Admin role required' },
        },
      },
    },
    '/api/v1/users/{userId}/roles/{role}': {
      delete: {
        summary: 'Remove a role from a user',
        tags: ['UsersAdmin'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/UserId' },
          {
            name: 'role',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['STUDENT', 'CUSTOMER', 'ADMIN'] },
          },
        ],
        responses: {
          204: { description: 'Role removed' },
          400: { description: 'Validation error' },
          403: { description: 'Admin role required' },
        },
      },
    },
    '/api/v1/users/{userId}/status': {
      patch: {
        summary: 'Update a user account status',
        tags: ['UsersAdmin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: {
          200: { description: 'Status updated' },
          400: { description: 'Validation error' },
          403: { description: 'Admin role required' },
        },
      },
    },
    '/api/v1/users/{userId}/deletion-request': {
      post: {
        summary: 'Create a GDPR deletion request for a user',
        tags: ['UsersAdmin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: {
          200: { description: 'Deletion request created' },
          403: { description: 'Admin role required' },
        },
      },
    },
    '/api/v1/users/{userId}/anonymize': {
      post: {
        summary: 'Anonymize a deleted user',
        tags: ['UsersAdmin'],
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: {
          200: { description: 'User anonymized' },
          403: { description: 'Admin role required' },
        },
      },
    },
  },
  components: {
    parameters: {
      UserId: {
        name: 'userId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    },
    schemas: {
      UserProfileInput: {
        type: 'object',
        required: ['firstName'],
        properties: {
          firstName: { type: 'string', example: 'Sabrina' },
          lastName: { type: 'string', example: 'Hammadi' },
          photoUrl: {
            type: 'string',
            example: 'https://example.com/photo.jpg',
          },
          city: { type: 'string', example: 'Paris' },
          latitude: { type: 'number', example: 48.8566 },
          longitude: { type: 'number', example: 2.3522 },
        },
      },
      StudentProfileInput: {
        type: 'object',
        required: ['domainId'],
        properties: {
          domainId: {
            type: 'string',
            format: 'uuid',
            example: '9324c24d-a476-41db-a0e3-12479bd81ed7',
          },
          title: { type: 'string', example: 'Developpeuse web' },
          description: {
            type: 'string',
            example: 'Creation de sites vitrines et applications web.',
          },
          status: {
            type: 'string',
            enum: ['DRAFT', 'VISIBLE', 'SUSPENDED'],
            example: 'DRAFT',
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
