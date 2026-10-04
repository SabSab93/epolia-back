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

  it('exposes Swagger UI', async () => {
    const response = await request(app).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Swagger UI');
  });
});
