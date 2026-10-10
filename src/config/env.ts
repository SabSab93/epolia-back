import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);
const unsafeJwtSecrets = ['dev-secret-change-me', 'change-me-in-local-env'];

if (nodeEnv === 'production' && unsafeJwtSecrets.includes(jwtSecret)) {
  throw new Error('JWT_SECRET is required in production');
}

if (
  nodeEnv === 'production' &&
  (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.trim() === '*')
) {
  throw new Error('CORS_ORIGIN must be restricted in production');
}

function parseCorsOrigin(
  value: string | undefined,
): boolean | string | string[] {
  if (!value || value.trim() === '*') {
    return true;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length === 1 ? origins[0] : origins;
}

export const config = {
  nodeEnv,
  port: Number(process.env.PORT) || 3000,
  corsOrigin,
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
};
