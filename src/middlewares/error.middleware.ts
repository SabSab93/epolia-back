import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '@/errors/app-error';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError(
      404,
      'NOT_FOUND',
      `Route ${request.method} ${request.originalUrl} not found`,
    ),
  );
};

// Errors raised by express.json before any route runs: invalid JSON, body too
// large… They carry a 4xx `status` and a `type` such as 'entity.parse.failed'.
function requestBodyError(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;

  const { status, type } = error as { status?: unknown; type?: unknown };
  if (typeof type !== 'string' || typeof status !== 'number') return undefined;
  if (status < 400 || status >= 500) return undefined;

  return type === 'entity.too.large'
    ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
    : new AppError(status, 'INVALID_REQUEST_BODY', 'Request body is invalid');
}

// Only the error type, its code and the stack frames: messages can contain
// request data (e-mail addresses, Prisma query arguments).
function describeError(error: unknown) {
  if (!(error instanceof Error)) return 'non-Error value thrown';

  const code =
    'code' in error && typeof error.code === 'string' ? ` ${error.code}` : '';
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .join('\n');

  return `${error.name}${code}\n${frames}`;
}

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  void next;

  const appError = error instanceof AppError ? error : requestBodyError(error);

  if (appError) {
    // Details first: they can never replace status, code or message.
    response.status(appError.status).json({
      ...appError.details,
      status: appError.status,
      code: appError.code,
      message: appError.message,
    });
    return;
  }

  // The path without its query string, which can hold an e-mail address.
  const path = request.originalUrl.split('?')[0];
  console.error(
    `Unexpected error on ${request.method} ${path}: ${describeError(error)}`,
  );

  response.status(500).json({
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  });
};
