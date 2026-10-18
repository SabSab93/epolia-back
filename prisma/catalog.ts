import { readFileSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';

export type Catalog = {
  version: 2;
  domains: { label: string; specialties: string[] }[];
  studyFields: {
    label: string;
    allowedSpecialties: { domain: string; specialty: string }[];
  }[];
};

export function normalizeLabel(label: string) {
  return label.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Catalog entry must be an object');
  }
  return value as Record<string, unknown>;
}

function label(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Catalog labels must be non-empty strings');
  }
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('Catalog collection must be an array');
  }
  return value;
}

function unique<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = key(value);
    if (seen.has(normalized)) {
      throw new Error(`Duplicate catalog label or association: ${normalized}`);
    }
    seen.add(normalized);
  }
  return values;
}

function specialtyKey(domain: string, specialty: string) {
  return JSON.stringify([normalizeLabel(domain), normalizeLabel(specialty)]);
}

export function validateCatalog(value: unknown): Catalog {
  const payload = record(value);
  if (payload.version !== 2) {
    throw new Error('Only catalog version 2 is supported');
  }

  const domains = unique(
    array(payload.domains).map((entry) => {
      const domain = record(entry);
      return {
        label: label(domain.label),
        specialties: unique(
          array(domain.specialties).map(label),
          normalizeLabel,
        ),
      };
    }),
    (domain) => normalizeLabel(domain.label),
  );
  const references = new Map<string, { domain: string; specialty: string }>();
  for (const domain of domains) {
    for (const specialty of domain.specialties) {
      references.set(specialtyKey(domain.label, specialty), {
        domain: domain.label,
        specialty,
      });
    }
  }

  const studyFields = unique(
    array(payload.studyFields).map((entry) => {
      const field = record(entry);
      return {
        label: label(field.label),
        allowedSpecialties: unique(
          array(field.allowedSpecialties).map((value) => {
            const pair = record(value);
            const domain = label(pair.domain);
            const specialty = label(pair.specialty);
            const reference = references.get(specialtyKey(domain, specialty));
            if (!reference) {
              throw new Error(
                `Unknown domain/specialty reference: ${domain} / ${specialty}`,
              );
            }
            return reference;
          }),
          (pair) => specialtyKey(pair.domain, pair.specialty),
        ),
      };
    }),
    (field) => normalizeLabel(field.label),
  );

  return { version: 2, domains, studyFields };
}

export function readCatalog(file: string) {
  return validateCatalog(JSON.parse(readFileSync(file, 'utf8')));
}

export function assertApprovedCatalog(candidate: Catalog, approved: Catalog) {
  const candidateDomains = new Map(
    candidate.domains.map((domain) => [normalizeLabel(domain.label), domain]),
  );
  const candidateFields = new Map(
    candidate.studyFields.map((field) => [normalizeLabel(field.label), field]),
  );
  for (const domain of approved.domains) {
    const reference = candidateDomains.get(normalizeLabel(domain.label));
    if (
      !reference ||
      domain.specialties.some(
        (specialty) =>
          !reference.specialties.some(
            (value) => normalizeLabel(value) === normalizeLabel(specialty),
          ),
      )
    ) {
      throw new Error(
        `Approved catalog domain is absent from candidate: ${domain.label}`,
      );
    }
  }
  for (const field of approved.studyFields) {
    const reference = candidateFields.get(normalizeLabel(field.label));
    const allowed = new Set(
      reference?.allowedSpecialties.map((pair) =>
        specialtyKey(pair.domain, pair.specialty),
      ),
    );
    if (
      !reference ||
      field.allowedSpecialties.some(
        (pair) => !allowed.has(specialtyKey(pair.domain, pair.specialty)),
      )
    ) {
      throw new Error(
        `Approved study field association is absent from candidate: ${field.label}`,
      );
    }
  }
}

function existingLabels<T extends { id: string; label: string }>(rows: T[]) {
  unique(rows, (row) => normalizeLabel(row.label));
  return new Map(rows.map((row) => [normalizeLabel(row.label), row]));
}

export async function importCatalog(prisma: PrismaClient, catalog: Catalog) {
  catalog = validateCatalog(catalog);
  return prisma.$transaction(
    async (tx) => {
      const domains = existingLabels(
        await tx.domain.findMany({ select: { id: true, label: true } }),
      );
      const fields = existingLabels(
        await tx.studyField.findMany({ select: { id: true, label: true } }),
      );
      const specialties = new Map<string, string>();
      for (const entry of catalog.domains) {
        const existing = domains.get(normalizeLabel(entry.label));
        const domain = await tx.domain.upsert({
          where: { label: existing?.label ?? entry.label },
          update: {},
          create: { label: entry.label },
        });
        const existingSpecialties = existingLabels(
          await tx.specialty.findMany({
            where: { domainId: domain.id },
            select: { id: true, label: true },
          }),
        );
        for (const specialtyLabel of entry.specialties) {
          const existing = existingSpecialties.get(
            normalizeLabel(specialtyLabel),
          );
          const specialty = await tx.specialty.upsert({
            where: {
              domainId_label: {
                domainId: domain.id,
                label: existing?.label ?? specialtyLabel,
              },
            },
            update: {},
            create: { domainId: domain.id, label: specialtyLabel },
          });
          specialties.set(
            specialtyKey(entry.label, specialtyLabel),
            specialty.id,
          );
        }
      }
      for (const entry of catalog.studyFields) {
        const existing = fields.get(normalizeLabel(entry.label));
        const field = await tx.studyField.upsert({
          where: { label: existing?.label ?? entry.label },
          update: {},
          create: { label: entry.label },
        });
        for (const pair of entry.allowedSpecialties) {
          const specialtyId = specialties.get(
            specialtyKey(pair.domain, pair.specialty),
          )!;
          await tx.studyFieldSpecialty.upsert({
            where: {
              studyFieldId_specialtyId: { studyFieldId: field.id, specialtyId },
            },
            update: {},
            create: { studyFieldId: field.id, specialtyId },
          });
        }
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 60000,
    },
  );
}
