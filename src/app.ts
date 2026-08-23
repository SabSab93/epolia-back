import compression from 'compression';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { getAppConfig, type AppConfig } from './config/env';
import { createHealthRouter } from './modules/health/health.routes';
import { usersRouter } from './routes/users.routes';
import {
  errorHandler,
  notFoundHandler,
} from './shared/middleware/error.middleware';

interface CreateAppOptions {
  config?: AppConfig;
  apiRouter?: Router;
}

export function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? getAppConfig();
  const app = express();
  const openApiDocument = createOpenApiDocument();

  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/v1/openapi.json', (_request, response) => {
    response.status(200).json(openApiDocument);
  });
  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Epolia API Docs',
    }),
  );

  app.use('/api/v1', options.apiRouter ?? createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function createApiRouter(): Router {
  const router = Router();

  router.use(createHealthRouter());
  router.use(usersRouter);

  return router;
}

function createOpenApiDocument() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Epolia Backend API',
      description: 'API backend de la marketplace Epolia',
      version: '1.0.0',
    },
    paths: {
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'Check API health',
          responses: {
            '200': {
              description: 'API is running',
            },
          },
        },
      },
    },
  };
}
