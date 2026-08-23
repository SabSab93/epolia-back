import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

if (nodeEnv === 'production' && jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET is required in production');
}

export const config = {
  nodeEnv,
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
};
