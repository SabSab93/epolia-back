import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Used by the Prisma CLI only (generate, migrate, seed). The API connects
// through the PostgreSQL adapter in src/prisma/client.ts, with DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node -r tsconfig-paths/register prisma/seed-catalog.ts',
  },
  datasource: {
    // Migrations need a direct connection, not the transaction pooler.
    // Left undefined when absent: `prisma generate` runs without a database.
    url: process.env.DIRECT_URL,
  },
});
