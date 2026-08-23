import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from '@/config/env';
import { errorHandler, notFoundHandler } from '@/middlewares/error.middleware';
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

app.use('/api/v1', usersRouter);

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Epolia API',
    version: '1.0.0',
  },
  paths: {},
};

app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
