import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from '@/config/env';
import { swaggerDocument } from '@/config/swagger';
import { errorHandler, notFoundHandler } from '@/middlewares/error.middleware';
import { authRouter } from '@/routes/auth.routes';
import { customerProfilesRouter } from '@/routes/customer-profiles.routes';
import { studentProfilesRouter } from '@/routes/student-profiles.routes';
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
app.use('/api/v1', customerProfilesRouter);
app.use('/api/v1', studentProfilesRouter);
app.use('/api/v1', userProfilesRouter);
app.use('/api/v1', usersRouter);

app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
