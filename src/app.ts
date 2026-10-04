import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from '@/config/env';
import { swaggerDocument } from '@/config/swagger';
import { errorHandler, notFoundHandler } from '@/middlewares/error.middleware';
import { authRouter } from '@/routes/auth.routes';
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

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

app.use('/api', authRouter);
app.use('/api', studentProfilesRouter);
app.use('/api', userProfilesRouter);
app.use('/api', usersRouter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
