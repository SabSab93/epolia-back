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

// Errors raised by express.json (body-parser) before any route runs. Only
// these `type` values are recognized, so another 4xx error keeps its meaning.
const requestBodyErrorTypes = new Set([
  'charset.unsupported',
  'encoding.unsupported',
  'entity.parse.failed',
  'entity.too.large',
  'entity.verify.failed',
  'parameters.too.many',
  'request.aborted',
  'request.size.invalid',
]);

function requestBodyError(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;

  const { status, type } = error as { status?: unknown; type?: unknown };
  if (typeof type !== 'string' || !requestBodyErrorTypes.has(type)) {
    return undefined;
  }
  if (typeof status !== 'number' || status < 400 || status >= 500) {
    return undefined;
  }

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
