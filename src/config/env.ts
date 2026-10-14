import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';

if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test or production');
}

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const unsafeJwtSecrets = ['dev-secret-change-me', 'change-me-in-local-env'];

if (
  nodeEnv === 'production' &&
  (jwtSecret.trim().length < 32 || unsafeJwtSecrets.includes(jwtSecret.trim()))
) {
  throw new Error(
    'JWT_SECRET must contain at least 32 characters and not be a development placeholder in production',
  );
}

const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);

function parseCorsOrigin(
  value: string | undefined,
): boolean | string | string[] {
  const origins =
    value
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (
    nodeEnv === 'production' &&
    (origins.length === 0 || origins.includes('*'))
  ) {
    throw new Error('CORS_ORIGIN must be restricted in production');
  }

  if (!value || value.trim() === '*') {
    return true;
  }

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
