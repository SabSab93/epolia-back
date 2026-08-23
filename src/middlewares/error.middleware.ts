import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../shared/errors/app-error';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError(
      404,
      'NOT_FOUND',
      `Route ${request.method} ${request.originalUrl} not found`,
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  void next;

  if (error instanceof AppError) {
    response.status(error.status).json({
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return;
  }

  response.status(500).json({
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  });
};
