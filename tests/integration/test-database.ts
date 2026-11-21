import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.CATALOG_TEST_DATABASE_URL,
  }),
});
