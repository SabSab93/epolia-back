import { AppError } from '../shared/errors/app-error';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: boolean | string[];
  jsonBodyLimit: string;
}

export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: parsePort(env.PORT),
    corsOrigin: parseCorsOrigin(env.CORS_ORIGIN),
    jsonBodyLimit: env.JSON_BODY_LIMIT ?? '1mb',
  };
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new AppError(
      500,
      'INVALID_CONFIG',
      'PORT must be a positive integer',
    );
  }

  return port;
}

function parseCorsOrigin(value: string | undefined): boolean | string[] {
  if (!value || value === '*') {
    return true;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
