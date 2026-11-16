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
                  email: { type: 'string', example: 'user@example.com' },
                  password: {
                    type: 'string',
                    minLength: 8,
                    example: 'password123',
                  },
                  firstName: { type: 'string', minLength: 1 },
                  lastName: { type: 'string', minLength: 1 },
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
                  email: { type: 'string', example: 'user@example.com' },
                  password: { type: 'string', example: 'password123' },
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
        summary:
          'Return the authenticated user’s latest terms of use acceptance',
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
              'ACCOUNT_NOT_ACTIVE, BIRTH_DATE_REQUIRED or ADULT_REQUIRED; ADMIN remains exempt from age checks',
          },
          409: {
            description:
              'ROLE_ACTIVATION_CONFLICT: concurrent changes prevented completion after three attempts; retry the request',
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
          403: { description: 'Forbidden' },
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
          403: { description: 'Forbidden' },
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
          'Eligibility requires a study field and both dates covering today (UTC civil date, inclusive). Incomplete, past or future educations grant no eligibility. A new education returns a visible profile to DRAFT.',
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
            description:
              'Invalid title, studyFieldId, dates or idempotency key',
          },
          401: { description: 'Authentication required' },
          403: { description: 'Student role required' },
          404: { description: 'Student profile or study field not found' },
        },
      },
    },
    '/api/student-educations/{educationId}': {
      patch: {
        summary:
          'Update an owned education and remove ineligible profile specialties',
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
              'Owned education, student profile or study field not found',
          },
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
                required: ['email', 'passwordHash'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  passwordHash: { type: 'string', writeOnly: true },
                  birthDate: {
                    type: 'string',
                    format: 'date',
                    writeOnly: true,
                    description:
                      'Required and age at least 18 unless roles includes ADMIN.',
                  },
                  phone: { type: 'string' },
                  roles: {
                    type: 'array',
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
          400: { description: 'Validation error' },
          403: { description: 'Admin role required' },
        },
      },
    },
    '/api/users/{userId}/roles': {
      post: {
        summary:
          'Assign a role to an active user (ADMIN exempt from age checks)',
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
          400: { description: 'Validation error' },
          403: { description: 'Admin role required' },
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
          400: { description: 'Validation error' },
          403: { description: 'Admin role required' },
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
          403: { description: 'Admin role required' },
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
          { type: 'object', required: ['title'] },
        ],
      },
      StudentEducationUpdate: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            example: 'Licence informatique',
          },
          school: {
            type: 'string',
            nullable: true,
            example: 'Universite Paris Cite',
          },
          level: { type: 'string', nullable: true, example: 'BAC+3' },
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
            required: ['id', 'studentId', 'studyFieldId'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              studentId: { type: 'string', format: 'uuid' },
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
          pricingDetails: { type: 'string', nullable: true },
        },
      },
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
        properties: {
          domainId: {
            type: 'string',
            format: 'uuid',
            description:
              'Omit to start a draft or to keep the currently selected domain.',
            example: '9324c24d-a476-41db-a0e3-12479bd81ed7',
          },
          title: { type: 'string', example: 'Developpeuse web' },
          description: {
            type: 'string',
            example: 'Creation de sites vitrines et applications web.',
          },
          status: {
            type: 'string',
            enum: ['DRAFT', 'SUSPENDED'],
            description:
              'Self-service publication is blocked until education verification is implemented (#55/#70)',
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
