export const authPaths = {
  '/api/auth/register': {
    post: {
      summary: 'Register a local user',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: [
                'email',
                'password',
                'birthDate',
                'firstName',
                'lastName',
                'termsAccepted',
                'termsVersion',
              ],
              properties: {
                email: {
                  type: 'string',
                  maxLength: 254,
                  example: 'user@example.com',
                },
                password: {
                  type: 'string',
                  minLength: 8,
                  maxLength: 128,
                  example: 'password123',
                },
                firstName: { type: 'string', minLength: 1, maxLength: 100 },
                lastName: { type: 'string', minLength: 1, maxLength: 100 },
                termsAccepted: { type: 'boolean', enum: [true] },
                termsVersion: {
                  type: 'string',
                  description:
                    'Version shown to the user, matching the version configured for registration.',
                },
                birthDate: {
                  type: 'string',
                  format: 'date',
                  description:
                    'Required civil date, age at least 18 (UTC). Never returned in user responses.',
                },
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
        201: {
          description:
            'User, role, profile and acceptance recorded atomically. ' +
            'The response contains `user.emailVerified` (false) and `emailVerificationSent`: true when the confirmation e-mail was accepted by the sending service (not proof of delivery), false when it could not be sent. The account exists in both cases; the app can then call POST /api/auth/email-verification.',
        },
        403: { description: 'ADULT_REQUIRED: user must be at least 18' },
        400: {
          description:
            'VALIDATION_ERROR: invalid registration data. ' +
            'TERMS_ACCEPTANCE_REQUIRED: terms must be accepted. ' +
            'TERMS_VERSION_INVALID: submitted terms version does not match the current version.',
        },
        409: { description: 'Email already used' },
        503: {
          description:
            'REGISTRATION_TERMS_UNAVAILABLE: no terms version configured',
        },
      },
    },
  },
  '/api/auth/login': {
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
                email: {
                  type: 'string',
                  maxLength: 254,
                  example: 'user@example.com',
                },
                password: {
                  type: 'string',
                  maxLength: 128,
                  example: 'password123',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description:
            'User logged in. `user.emailVerified` is read from the database.',
        },
        400: { description: 'Validation error' },
        401: { description: 'Invalid email or password' },
        403: {
          description: 'Account inactive, missing birth date or age below 18',
        },
      },
    },
  },
  '/api/auth/me': {
    get: {
      summary: 'Return the authenticated user',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description:
            'Authenticated user: id, email, emailVerified (read from the database on every request) and roles',
        },
        401: { description: 'Authentication required' },
        403: {
          description: 'Account inactive, missing birth date or age below 18',
        },
      },
    },
  },
  '/api/auth/terms-acceptance': {
    get: {
      summary: 'Return the authenticated user’s latest terms of use acceptance',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description:
            'Version and date of acceptance, or null when no acceptance has been recorded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                nullable: true,
                required: ['version', 'acceptedAt'],
                properties: {
                  version: { type: 'string' },
                  acceptedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        401: { description: 'Authentication required' },
        403: {
          description: 'Account inactive, missing birth date or age below 18',
        },
      },
    },
  },
  '/api/auth/roles': {
    post: {
      summary: 'Activate STUDENT or CUSTOMER on the authenticated account',
      description:
        'Idempotently adds a role to the current account and returns its updated roles and a renewed JWT. Never grants ADMIN, creates a second account, changes existing profile data or publishes/verifies a student profile. Permissions are reloaded from the database, including for existing tokens.',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['role'],
              properties: {
                role: {
                  type: 'string',
                  enum: ['STUDENT', 'CUSTOMER'],
                  example: 'STUDENT',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description:
            'Role activated or already present; current account and renewed JWT',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user', 'accessToken'],
                properties: {
                  user: {
                    type: 'object',
                    required: ['id', 'email', 'status', 'roles'],
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      email: {
                        type: 'string',
                        format: 'email',
                        nullable: true,
                      },
                      emailVerified: { type: 'boolean' },
                      status: { type: 'string', enum: ['ACTIVE'] },
                      roles: {
                        type: 'array',
                        uniqueItems: true,
                        items: {
                          type: 'string',
                          enum: ['STUDENT', 'CUSTOMER', 'ADMIN'],
                        },
                      },
                    },
                  },
                  accessToken: {
                    type: 'string',
                    description: 'JWT containing the updated roles',
                  },
                },
              },
            },
          },
        },
        400: {
          description: 'VALIDATION_ERROR: role must be STUDENT or CUSTOMER',
        },
        401: {
          description:
            'UNAUTHORIZED: missing/invalid token or account no longer exists',
        },
        403: {
          description:
            'ACCOUNT_NOT_ACTIVE, BIRTH_DATE_REQUIRED or ADULT_REQUIRED',
        },
        409: {
          description:
            'ADMIN_ROLE_EXCLUSIVE: an admin account cannot have another role. ROLE_ACTIVATION_CONFLICT: concurrent changes prevented completion after three attempts; retry the request',
        },
      },
    },
  },
  '/api/auth/email-verification': {
    post: {
      summary: 'Send a new e-mail confirmation code',
      description:
        'Sends a 6-digit code valid 10 minutes. The new code becomes valid, and the previous one stops working, only once the e-mail is accepted. At most one e-mail per minute and five per 24 hours per account. A 202 means the sending service accepted the e-mail, not that it reached the inbox.',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      responses: {
        202: {
          description: 'E-mail accepted by the sending service',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  emailVerificationSent: { type: 'boolean', enum: [true] },
                },
              },
            },
          },
        },
        401: { description: 'UNAUTHORIZED' },
        403: {
          description:
            'ACCOUNT_NOT_ACTIVE, BIRTH_DATE_REQUIRED, ADULT_REQUIRED, or EMAIL_VERIFICATION_LOCKED (20 wrong codes on this account: no more codes are sent)',
        },
        409: { description: 'EMAIL_ALREADY_VERIFIED' },
        429: {
          description:
            'EMAIL_VERIFICATION_RATE_LIMITED: wait one minute, at most 5 e-mails per 24 hours',
        },
        502: {
          description:
            'EMAIL_SEND_FAILED: the sending service refused or could not be reached',
        },
        503: {
          description:
            'EMAIL_SERVICE_UNAVAILABLE: sending is not configured on the server',
        },
      },
    },
  },
  '/api/auth/email-verification/verify': {
    post: {
      summary: 'Confirm the e-mail address with the 6-digit code',
      description:
        'Checks the last code sent to the signed-in account. Each check counts as one attempt before the comparison: at most 5 per code, even with simultaneous requests. A malformed code is not counted. A code sent to a previous address never confirms the current one. The app then reads the new state from GET /api/auth/me.',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: {
                  type: 'string',
                  pattern: '^\\d{6}$',
                  example: '048213',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Address confirmed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  emailVerified: { type: 'boolean', enum: [true] },
                },
              },
            },
          },
        },
        400: {
          description:
            'VALIDATION_ERROR (not 6 digits), EMAIL_REQUIRED, or EMAIL_VERIFICATION_CODE_INVALID with `attemptsRemaining` (1 to 4)',
        },
        401: { description: 'UNAUTHORIZED' },
        403: {
          description:
            'ACCOUNT_NOT_ACTIVE, BIRTH_DATE_REQUIRED or ADULT_REQUIRED',
        },
        409: { description: 'EMAIL_ALREADY_VERIFIED' },
        410: {
          description:
            'The code can no longer be used, request a new one. EMAIL_VERIFICATION_CODE_EXPIRED: older than 10 minutes, replaced by a newer code, sent to a previous address, or no code sent. EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS: 5 attempts used.',
        },
      },
    },
  },
};
