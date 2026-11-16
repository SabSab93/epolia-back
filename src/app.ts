import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from '@/config/env';
import { swaggerDocument } from '@/config/swagger';
import { errorHandler, notFoundHandler } from '@/middlewares/error.middleware';
import {
  apiRateLimit,
  loginRateLimit,
  registerRateLimit,
} from '@/middlewares/rate-limit.middleware';
import { authRouter } from '@/routes/auth.routes';
import { domainsRouter } from '@/routes/domains.routes';
import { emailVerificationRouter } from '@/routes/email-verification.routes';
import { studyFieldsRouter } from '@/routes/study-fields.routes';
import { studentEducationsRouter } from '@/routes/student-educations.routes';
import { studentProfilesRouter } from '@/routes/student-profiles.routes';
import { studentSpecialtiesRouter } from '@/routes/student-specialties.routes';
import { userProfilesRouter } from '@/routes/user-profiles.routes';
import { usersRouter } from '@/routes/users.routes';

const app = express();

app.set('trust proxy', config.trustProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Outside production, keep http forms working (e.g. the e-mail
        // confirmation page opened on a phone over the local network).
        upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
      },
    },
  }),
);
// The app sends its token in the Authorization header, not in a cookie:
// no `credentials`, so browsers never attach cookies to cross-origin calls.
app.use(
  cors({
    origin: config.corsOrigin,
  }),
);

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

// After the health check, which the host calls often from its own IP, and
// before the body is read: invalid or oversized bodies count too.
app.use('/api', apiRateLimit);
app.use('/api/auth/login', loginRateLimit);
app.use('/api/auth/register', registerRateLimit);

app.use(compression());

app.use(
  express.json({
    limit: config.jsonBodyLimit,
  }),
);

app.use('/api', authRouter);
app.use('/api', domainsRouter);
app.use('/api', emailVerificationRouter);
app.use('/api', studyFieldsRouter);
app.use('/api', studentEducationsRouter);
app.use('/api', studentProfilesRouter);
app.use('/api', studentSpecialtiesRouter);
app.use('/api', userProfilesRouter);
app.use('/api', usersRouter);

// Interactive API docs, admin routes included: development and tests only.
if (config.nodeEnv !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
