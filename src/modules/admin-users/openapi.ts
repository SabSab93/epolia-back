export const adminUsersPaths = {
  '/api/users/local': {
    post: {
      summary: 'Create a local user (ADMIN exempt from age checks)',
      tags: ['UsersAdmin'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  maxLength: 254,
                  description: 'Stored in lower case.',
                },
                password: {
                  type: 'string',
                  minLength: 8,
                  maxLength: 128,
                  writeOnly: true,
                  description: 'Hashed by the server.',
                },
                birthDate: {
                  type: 'string',
                  format: 'date',
                  writeOnly: true,
                  description:
                    'Required and age at least 18 unless roles is [ADMIN].',
                },
                phone: {
                  type: 'string',
                  maxLength: 20,
                  example: '+33612345678',
                  description:
                    'Digits, with an optional leading + and spaces, dots or dashes.',
                },
                roles: {
                  type: 'array',
                  description: 'ADMIN cannot be combined with another role.',
                  items: {
                    type: 'string',
                    enum: ['STUDENT', 'CUSTOMER', 'ADMIN'],
                  },
                },
              },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
      responses: {
        201: { description: 'User created' },
        400: {
          description:
            'VALIDATION_ERROR, or ADMIN_ROLE_EXCLUSIVE when ADMIN is combined with another role',
        },
        403: { description: 'Admin role required' },
        409: { description: 'EMAIL_ALREADY_USED or PHONE_ALREADY_USED' },
      },
    },
  },
  '/api/users/{userId}/roles': {
    post: {
      summary:
        'Assign a role to an active user (ADMIN exempt from age checks, never combined with another role)',
      tags: ['UsersAdmin'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/UserId' }],
      responses: {
        200: { description: 'Role assigned' },
        400: { description: 'Invalid user id or role' },
        403: {
          description:
            'Admin role required, ACCOUNT_NOT_ACTIVE or no adult birth date',
        },
        404: { description: 'User not found' },
        409: {
          description:
            'ADMIN_ROLE_EXCLUSIVE: an admin account cannot have another role',
        },
      },
    },
  },
  '/api/users/{userId}/roles/{role}': {
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
        400: { description: 'Invalid user id or role' },
        403: { description: 'Admin role required' },
        404: { description: 'User not found' },
        409: {
          description: 'LAST_ADMIN: the last active admin keeps the role',
        },
      },
    },
  },
  '/api/users/{userId}/status': {
    patch: {
      summary: 'Update a user account status',
      tags: ['UsersAdmin'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/UserId' }],
      responses: {
        200: { description: 'Status updated' },
        400: { description: 'Invalid user id or status' },
        403: { description: 'Admin role required' },
        404: { description: 'User not found' },
        409: {
          description:
            'LAST_ADMIN (the last active admin stays active) or ACCOUNT_ANONYMIZED',
        },
      },
    },
  },
  '/api/users/{userId}/deletion-request': {
    post: {
      summary: 'Create a GDPR deletion request for a user',
      tags: ['UsersAdmin'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/UserId' }],
      responses: {
        200: { description: 'Deletion request created' },
        400: { description: 'Invalid user id' },
        403: { description: 'Admin role required' },
        404: { description: 'User not found' },
        409: {
          description: 'ACCOUNT_ANONYMIZED or DELETION_ALREADY_REQUESTED',
        },
      },
    },
  },
  '/api/users/{userId}/anonymize': {
    post: {
      summary: 'Anonymize a deleted user',
      tags: ['UsersAdmin'],
      security: [{ bearerAuth: [] }],
      parameters: [{ $ref: '#/components/parameters/UserId' }],
      responses: {
        200: { description: 'User anonymized' },
        400: { description: 'Invalid user id' },
        403: { description: 'Admin role required' },
        404: { description: 'User not found' },
        409: {
          description:
            'LAST_ADMIN (the last active admin cannot be anonymized) or ACCOUNT_ANONYMIZED',
        },
      },
    },
  },
};
