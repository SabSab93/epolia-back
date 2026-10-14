// Keep the local .env from supplying values that a test deliberately omits.
jest.mock('dotenv/config', () => ({}));

const originalEnv = process.env;
const validJwtSecret = '0123456789abcdef0123456789abcdef';

function loadConfig() {
  return (require('./env') as typeof import('./env')).config;
}

describe('Environment configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.CORS_ORIGIN;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it.each(['', 'prod', 'Production', 'staging'])(
    'rejects an invalid NODE_ENV: %j',
    (value) => {
      process.env.NODE_ENV = value;

      expect(loadConfig).toThrow(
        'NODE_ENV must be development, test or production',
      );
    },
  );

  it.each(['development', 'test', 'production'])(
    'accepts NODE_ENV=%s',
    (value) => {
      process.env.NODE_ENV = value;
      process.env.JWT_SECRET = validJwtSecret;
      process.env.CORS_ORIGIN = 'https://epolia.fr';

      expect(loadConfig().nodeEnv).toBe(value);
    },
  );

  it('keeps local defaults when environment variables are absent', () => {
    expect(loadConfig()).toMatchObject({
      nodeEnv: 'development',
      jwtSecret: 'dev-secret-change-me',
      corsOrigin: true,
    });
  });

  it('accepts the usual local development configuration', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'change-me-in-local-env';
    process.env.CORS_ORIGIN = 'http://localhost:3000, http://localhost:8081';

    expect(loadConfig()).toMatchObject({
      nodeEnv: 'development',
      jwtSecret: 'change-me-in-local-env',
      corsOrigin: ['http://localhost:3000', 'http://localhost:8081'],
    });
  });

  it('continues to allow a wildcard in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGIN = '*';

    expect(loadConfig().corsOrigin).toBe(true);
  });

  describe('Production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = validJwtSecret;
      process.env.CORS_ORIGIN = 'https://epolia.fr';
    });

    it.each([
      undefined,
      '',
      ' '.repeat(32),
      'secret',
      'a'.repeat(31),
      ` ${'a'.repeat(31)} `,
      'dev-secret-change-me',
      'change-me-in-local-env',
    ])('rejects an invalid JWT_SECRET: %j', (value) => {
      if (value === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = value;
      }

      expect(loadConfig).toThrow(
        'JWT_SECRET must contain at least 32 characters',
      );
    });

    it('accepts a JWT_SECRET of exactly 32 characters', () => {
      expect(loadConfig().jwtSecret).toBe(validJwtSecret);
    });

    it.each([undefined, '', '   ', ' , , ', '*', 'https://epolia.fr, *'])(
      'rejects an invalid CORS_ORIGIN: %j',
      (value) => {
        if (value === undefined) {
          delete process.env.CORS_ORIGIN;
        } else {
          process.env.CORS_ORIGIN = value;
        }

        expect(loadConfig).toThrow(
          'CORS_ORIGIN must be restricted in production',
        );
      },
    );

    it('accepts a single CORS origin', () => {
      process.env.CORS_ORIGIN = ' https://epolia.fr ';

      expect(loadConfig().corsOrigin).toBe('https://epolia.fr');
    });

    it('accepts multiple CORS origins and cleans empty entries', () => {
      process.env.CORS_ORIGIN =
        ' https://epolia.fr, , https://admin.epolia.fr, ';

      expect(loadConfig().corsOrigin).toEqual([
        'https://epolia.fr',
        'https://admin.epolia.fr',
      ]);
    });
  });
});
