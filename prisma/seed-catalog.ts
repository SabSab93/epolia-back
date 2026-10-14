import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertApprovedCatalog, importCatalog, readCatalog } from './catalog';

const prisma = new PrismaClient();

async function main() {
  const candidate = readCatalog(
    join(__dirname, 'catalog', 'archive', 'catalog-v2.json'),
  );
  const approved = readCatalog(join(__dirname, 'catalog', 'approved.json'));
  assertApprovedCatalog(candidate, approved);

  if (!approved.domains.length && !approved.studyFields.length) {
    console.log('No approved catalog associations. Nothing was imported.');
    return;
  }

  await importCatalog(prisma, approved);
  console.log(
    'Approved catalog imported. Existing business data was preserved.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
