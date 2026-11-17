import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';

if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test or production');
}

// Only tests get a built-in secret: anywhere else, a missing JWT_SECRET would
// sign tokens with a value anyone can read in this public repository.
const testJwtSecret = 'test-secret-not-for-real-use';
const jwtSecret =
  process.env.JWT_SECRET || (nodeEnv === 'test' ? testJwtSecret : '');
const unsafeJwtSecrets = [
  'dev-secret-change-me',
  'change-me-in-local-env',
  testJwtSecret,
];

if (
  nodeEnv === 'production' &&
  (jwtSecret.trim().length < 32 || unsafeJwtSecrets.includes(jwtSecret.trim()))
) {
  throw new Error(
    'JWT_SECRET must contain at least 32 characters and not be a development placeholder in production',
  );
}

if (!jwtSecret.trim()) {
  throw new Error('JWT_SECRET is required');
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

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

// Number of proxies (load balancer, CDN) in front of the API. Express needs it
// to read the client IP that the rate limits count. Too high, a client can
// fake its IP; too low, every client shares the proxy's IP and its limits.
function parseTrustProxy(value: string | undefined): number {
  const hops = value?.trim();

  if (!hops) {
    if (nodeEnv === 'production') {
      throw new Error('TRUST_PROXY must be set in production');
    }
    return 0;
  }

  if (!/^\d+$/.test(hops) || Number(hops) > 10) {
    throw new Error('TRUST_PROXY must be a number of proxies from 0 to 10');
  }

  return Number(hops);
}

// Certificate authority of the database server (Supabase: Database Settings >
// SSL Configuration). With it, the API encrypts the connection and checks the
// server identity. The pg driver does not encrypt by default, so production
// refuses to start without it.
const databaseSslCa = process.env.DATABASE_SSL_CA?.trim();

if (
  nodeEnv === 'production' &&
  !databaseSslCa?.includes('-----BEGIN CERTIFICATE-----')
) {
  throw new Error(
    'DATABASE_SSL_CA must contain a PEM certificate in production',
  );
}

export const config = {
  nodeEnv,
  port: Number(process.env.PORT) || 3000,
  corsOrigin,
  trustProxy,
  databaseUrl: process.env.DATABASE_URL,
  databaseSslCa,
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  registrationTermsVersion: process.env.REGISTRATION_TERMS_VERSION?.trim(),
  resendApiKey: process.env.RESEND_API_KEY?.trim(),
  emailFrom: process.env.EMAIL_FROM?.trim(),
};
