import type { Prisma } from '@prisma/client';
import { AppError } from '@/errors/app-error';
import { getCatalogOffer } from '@/modules/catalog/education-directory';

export function readDirectoryId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} is invalid`);
  }
  return value.trim();
}

// In particular a missing directory table or failed import must not be
// reported to the student as “no matching formation”.
export async function readDirectory<T>(read: () => T | Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      503,
      'EDUCATION_CATALOG_UNAVAILABLE',
      'Education catalog unavailable',
    );
  }
}

export async function requireCatalogOffer(
  id: string,
  tx?: Prisma.TransactionClient,
) {
  const offer = await readDirectory(() => getCatalogOffer(id, tx));
  if (!offer) {
    throw new AppError(
      404,
      'CATALOG_OFFER_NOT_FOUND',
      'Education offer not found',
    );
  }
  return offer;
}
