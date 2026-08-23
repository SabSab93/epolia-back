import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from '@/config/env';
import { errorHandler, notFoundHandler } from '@/middlewares/error.middleware';
import { authRouter } from '@/routes/auth.routes';
import { userProfilesRouter } from '@/routes/user-profiles.routes';
import { usersRouter } from '@/routes/users.routes';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(compression());

app.use(
  express.json({
    limit: config.jsonBodyLimit,
  }),
);

app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

app.use('/api/v1', authRouter);
app.use('/api/v1', userProfilesRouter);
app.use('/api/v1', usersRouter);

const swaggerDocument = {
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
        summary: 'Create or update the authenticated user profile',
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
          200: { description: 'Profile saved' },
          400: { description: 'Validation error' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/api/v1/users/{userId}/profile': {
      get: {
        summary: 'Get a user profile by user id',
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
          200: { description: 'Profile found' },
          404: { description: 'Profile not found' },
        },
      },
    },
    '/api/v1/user-profiles/me': {
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

app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
