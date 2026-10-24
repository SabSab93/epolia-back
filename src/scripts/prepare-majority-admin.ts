import { readFileSync } from 'node:fs';
import { AppError } from '@/errors/app-error';
import { prisma } from '@/prisma/client';
import {
  hasEligibleAdmin,
  recordConfirmedAdminBirthDate,
} from '@/services/admin-majority-transition';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--apply'].includes(args[0])) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Usage: users:prepare-majority -- --check|--apply',
    );
  }
  if (args[0] === '--apply') {
    // stdin keeps the confirmed date out of command arguments and shell history.
    let input: unknown;
    try {
      input = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'stdin must contain a JSON object with userId and birthDate',
      );
    }
    await recordConfirmedAdminBirthDate(prisma, input);
  }
  if (!(await hasEligibleAdmin(prisma))) {
    throw new AppError(
      409,
      'ADMIN_TRANSITION_REQUIRED',
      'No active adult administrator: complete the authorized transition before opening traffic',
    );
  }
  console.log(
    'An active adult administrator is available. No account was activated or granted a role.',
  );
}

void main()
  .catch((error: unknown) => {
    // Never print input, dates, Prisma parameters or database connection strings.
    console.error(
      error instanceof AppError
        ? `${error.code}: ${error.message}`
        : 'Administrator transition failed',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
