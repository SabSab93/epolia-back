import express from 'express';
import request from 'supertest';
import app from '@/app';
import { AppError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error.middleware';

interface HealthBody {
  status: string;
}

interface ErrorBody {
  status: number;
  code: string;
  message: string;
}

describe('Express app', () => {
  it('returns the health status from /api/health', async () => {
    const response = await request(app).get('/api/health');
    const body = response.body as HealthBody;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('returns a typed 404 error for unknown routes', async () => {
    const response = await request(app).get('/api/unknown');
    const body = response.body as ErrorBody;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Route GET /api/unknown not found',
    });
  });

  it('keeps old customer profile routes unavailable', async () => {
    const response = await request(app).get('/api/customer-profiles/me');
    const body = response.body as ErrorBody;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Route GET /api/customer-profiles/me not found',
    });
  });

  it('formats application errors consistently', async () => {
    const testApp = express();

    testApp.get('/error', () => {
      throw new AppError(400, 'TEST_ERROR', 'Test error');
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/error');
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      status: 400,
      code: 'TEST_ERROR',
      message: 'Test error',
    });
  });

  it('rejects invalid JSON with a 400 instead of a 500', async () => {
    const response = await request(app)
      .post('/api/student-profiles')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 400,
      code: 'INVALID_REQUEST_BODY',
      message: 'Request body is invalid',
    });
  });

  it('rejects a body over the size limit with a 413', async () => {
    const response = await request(app)
      .post('/api/student-profiles')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a'.repeat(2 * 1024 * 1024) }));

    expect(response.status).toBe(413);
    expect((response.body as ErrorBody).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('logs unexpected errors without their message or query string', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const testApp = express();

    testApp.get('/boom', () => {
      throw new Error('Unique constraint failed for student@example.com');
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/boom?email=a@example.com');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(log).toHaveBeenCalledTimes(1);
    const logged = String(log.mock.calls[0]?.[0]);
    expect(logged).toContain('Unexpected error on GET /boom: Error');
    expect(logged).not.toContain('example.com');
    log.mockRestore();
  });

  it('keeps the meaning of unrelated 4xx errors that carry a type', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const testApp = express();

    testApp.get('/other', () => {
      throw Object.assign(new Error('Forbidden'), {
        status: 403,
        type: 'upload.rejected',
      });
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/other');

    expect(response.status).toBe(500);
    expect((response.body as ErrorBody).code).toBe('INTERNAL_SERVER_ERROR');
    log.mockRestore();
  });

  it('limits failed logins per client, invalid bodies included', async () => {
    const attempt = () => request(app).post('/api/auth/login').send({});
    const invalidJson = () =>
      request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":');

    for (let index = 0; index < 5; index++) {
      expect((await invalidJson()).status).toBe(400);
      expect((await attempt()).status).toBe(400);
    }
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests, try again later',
    });
  });

  it('limits registrations per client', async () => {
    const attempt = () => request(app).post('/api/auth/register').send({});

    for (let index = 0; index < 10; index++) {
      expect((await attempt()).status).toBe(400);
    }

    expect((await attempt()).status).toBe(429);
  });

  it('does not rate limit the health check', async () => {
    for (let index = 0; index < 130; index++) {
      await request(app).get('/api/health');
    }

    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('does not allow cookies on cross-origin calls', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:8081');

    expect(response.headers['access-control-allow-origin']).toBeDefined();
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  it('does not serve Swagger UI in production', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_SECRET: '0123456789abcdef0123456789abcdef',
      CORS_ORIGIN: 'https://epolia.fr',
      TRUST_PROXY: '1',
      DATABASE_SSL_CA:
        '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    };

    try {
      let productionApp: typeof app | undefined;
      jest.isolateModules(() => {
        productionApp = (require('@/app') as typeof import('@/app')).default;
      });

      const response = await request(productionApp!).get('/api/docs/');

      expect(response.status).toBe(404);
    } finally {
      process.env = originalEnv;
    }
  });

  it('exposes Swagger UI outside production', async () => {
    const response = await request(app).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Swagger UI');
  });
});
