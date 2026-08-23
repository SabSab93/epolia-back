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
          200: {
            description: 'API is running',
          },
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
                    enum: ['ETUDIANT', 'PARTICULIER'],
                    example: 'PARTICULIER',
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
        summary: 'Return the authenticated user from the JWT',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Authenticated user' },
          401: { description: 'Authentication required' },
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
              schema: {
                type: 'object',
                required: ['firstName'],
                properties: {
                  firstName: { type: 'string', example: 'Sabrina' },
                  lastName: { type: 'string', example: 'Hammadi' },
                  photoUrl: {
                    type: 'string',
                    example: 'https://example.com/photo.jpg',
                  },
                  address: { type: 'string', example: '10 rue de Paris' },
                  postalCode: { type: 'string', example: '75001' },
                  city: { type: 'string', example: 'Paris' },
                  country: { type: 'string', example: 'FR' },
                },
              },
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
    '/api/v1/users/{userId}/profile': {
      get: {
        summary: 'Get a public user profile by user id',
        tags: ['UserProfile'],
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: { description: 'Public profile found' },
          404: { description: 'Profile not found' },
        },
      },
    },
    '/api/v1/user-profiles/me': {
      get: {
        summary: 'Get the authenticated user full profile',
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
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string', example: 'Sabrina' },
                  lastName: { type: 'string', example: 'Hammadi' },
                  photoUrl: {
                    type: 'string',
                    example: 'https://example.com/photo.jpg',
                  },
                  address: { type: 'string', example: '10 rue de Paris' },
                  postalCode: { type: 'string', example: '75001' },
                  city: { type: 'string', example: 'Paris' },
                  country: { type: 'string', example: 'FR' },
                },
              },
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
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};
