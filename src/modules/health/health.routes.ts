import { Router } from 'express';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'epolia-back',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
