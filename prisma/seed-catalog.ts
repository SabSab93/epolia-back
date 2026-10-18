import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { importCatalog, readActiveCatalog } from '@root/prisma/catalog';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run')) {
    throw new Error('Usage: npm run catalog:import -- [--dry-run]');
  }
  const approved = readActiveCatalog(
    join(__dirname, 'catalog', 'approved.json'),
  );
  if (!approved.domains.length && !approved.studyFields.length) {
    console.log('No approved catalog associations. Nothing was imported.');
    return;
  }
  const report = await importCatalog(prisma, approved, {
    dryRun: args.includes('--dry-run'),
  });
  const studyFieldLabels = new Map(
    approved.studyFields.map((field) => [field.id, field.label]),
  );
  const specialtyLabels = new Map(
    approved.domains.flatMap((domain) =>
      domain.specialties.map((specialty) => [specialty.id, specialty.label]),
    ),
  );
  const createdLinks = report.links
    .filter((link) => link.action === 'create')
    .map(({ studyFieldId, specialtyId }) => ({
      studyFieldId,
      specialtyId,
      studyFieldLabel: studyFieldLabels.get(studyFieldId),
      specialtyLabel: specialtyLabels.get(specialtyId),
    }));
  console.log(
    JSON.stringify(
      {
        dryRun: report.dryRun,
        entries: {
          created: report.changes.filter((change) => change.action === 'create')
            .length,
          renamed: report.changes.filter((change) => change.action === 'rename')
            .length,
          unchanged: report.changes.filter(
            (change) => change.action === 'unchanged',
          ).length,
        },
        links: {
          created: report.links.filter((link) => link.action === 'create')
            .length,
          unchanged: report.links.filter((link) => link.action === 'unchanged')
            .length,
        },
        createdLinks,
        changes: report.changes.filter(
          (change) => change.action !== 'unchanged',
        ),
        conflicts: report.conflicts,
      },
      null,
      2,
    ),
  );
  if (report.conflicts.length) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
