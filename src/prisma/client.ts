import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from '@/config/env';

// Prisma 7 connects through a driver adapter. DATABASE_URL is the runtime
// connection (the transaction pooler on Supabase). With DATABASE_SSL_CA, the
// connection is encrypted and the server certificate is verified; without it
// (local Docker database), the connection is not encrypted.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: config.databaseUrl,
    ssl: config.databaseSslCa ? { ca: config.databaseSslCa } : undefined,
  }),
});
