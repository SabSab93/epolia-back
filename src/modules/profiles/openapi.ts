export const profilesPaths = {
  '/api/user-profiles': {
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
  '/api/user-profiles/me': {
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
  '/api/users/{userId}/profile': {
    get: {
      summary: 'Get the authenticated user’s profile by their own user id',
      tags: ['UserProfile'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/UserId' }],
      responses: {
        200: { description: 'Profile found' },
        401: { description: 'Authentication required' },
        403: {
          description: 'Account inactive, missing birth date or age below 18',
        },
        404: {
          description:
            'Profile not found or not owned by the authenticated user',
        },
      },
    },
  },
};
