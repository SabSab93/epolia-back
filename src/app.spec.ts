import { Router } from 'express';
import request from 'supertest';
import { createApp } from './app';
import { AppError } from './shared/errors/app-error';

interface HealthBody {
  status: string;
  service: string;
  timestamp: string;
}

interface ErrorBody {
  status: number;
  code: string;
  message: string;
}

describe('Express app', () => {
  it('returns the health status from /api/v1/health', async () => {
    const response = await request(createApp()).get('/api/v1/health');
    const body = response.body as HealthBody;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('epolia-back');
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('returns a typed 404 error for unknown routes', async () => {
    const response = await request(createApp()).get('/api/v1/unknown');
    const body = response.body as ErrorBody;

    expect(response.status).toBe(404);
    expect(body).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Route GET /api/v1/unknown not found',
    });
  });

  it('formats application errors consistently', async () => {
    const router = Router();

    router.get('/error', () => {
      throw new AppError(400, 'TEST_ERROR', 'Test error');
    });

    const response = await request(createApp({ apiRouter: router })).get(
      '/api/v1/error',
    );
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      status: 400,
      code: 'TEST_ERROR',
      message: 'Test error',
    });
  });

  it('exposes the OpenAPI document', async () => {
    const response = await request(createApp()).get('/api/v1/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      openapi: '3.0.0',
      info: {
        title: 'Epolia Backend API',
      },
    });
  });

  it('exposes Swagger UI', async () => {
    const response = await request(createApp()).get('/api/v1/docs/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Epolia API Docs');
  });
});
