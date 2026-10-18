import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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

// The active format references immutable UUIDs, never display labels.
export type ActiveCatalog = {
  version: 3;
  domains: {
    id: string;
    label: string;
    specialties: { id: string; label: string }[];
  }[];
  studyFields: { id: string; label: string; allowedSpecialtyIds: string[] }[];
};

export function validateActiveCatalog(value: unknown): ActiveCatalog {
  const payload = record(value);
  if (payload.version !== 3)
    throw new Error('Active catalog must use version 3');
  const ids = new Set<string>();
  function id(value: unknown) {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new Error('Catalog IDs must be UUIDs');
    }
    const result = value.toLowerCase();
    if (ids.has(result)) throw new Error(`Duplicate catalog ID: ${result}`);
    ids.add(result);
    return result;
  }
  const domains = unique(
    array(payload.domains).map((entry) => {
      const domain = record(entry);
      return {
        id: id(domain.id),
        label: label(domain.label),
        specialties: unique(
          array(domain.specialties).map((entry) => {
            const specialty = record(entry);
            return { id: id(specialty.id), label: label(specialty.label) };
          }),
          (entry) => normalizeLabel(entry.label),
        ),
      };
    }),
    (entry) => normalizeLabel(entry.label),
  );
  const specialtyIds = new Set(
    domains.flatMap((domain) => domain.specialties.map((entry) => entry.id)),
  );
  const studyFields = unique(
    array(payload.studyFields).map((entry) => {
      const field = record(entry);
      return {
        id: id(field.id),
        label: label(field.label),
        allowedSpecialtyIds: unique(
          array(field.allowedSpecialtyIds).map((value) => {
            if (
              typeof value !== 'string' ||
              !specialtyIds.has(value.toLowerCase())
            ) {
              throw new Error(`Unknown specialty ID: ${String(value)}`);
            }
            return value.toLowerCase();
          }),
          (value) => value,
        ),
      };
    }),
    (entry) => normalizeLabel(entry.label),
  );
  return { version: 3, domains, studyFields };
}

export function readActiveCatalog(file: string) {
  return validateActiveCatalog(JSON.parse(readFileSync(file, 'utf8')));
}

type CatalogChange = {
  entity: 'domain' | 'specialty' | 'studyField';
  action: 'create' | 'rename' | 'unchanged';
  id: string;
  label: string;
  previousLabel?: string;
  domainId?: string;
};
export type CatalogReport = {
  dryRun: boolean;
  changes: CatalogChange[];
  links: {
    studyFieldId: string;
    specialtyId: string;
    action: 'create' | 'unchanged';
  }[];
  conflicts: string[];
};

async function applyCatalogPlan(
  tx: Prisma.TransactionClient,
  report: CatalogReport,
) {
  for (const change of report.changes) {
    if (change.action === 'unchanged') continue;
    const data = { label: change.label };
    if (change.entity === 'domain') {
      if (change.action === 'create')
        await tx.domain.create({ data: { id: change.id, ...data } });
      else await tx.domain.update({ where: { id: change.id }, data });
    } else if (change.entity === 'specialty') {
      if (change.action === 'create')
        await tx.specialty.create({
          data: { id: change.id, domainId: change.domainId!, ...data },
        });
      else await tx.specialty.update({ where: { id: change.id }, data });
    } else {
      if (change.action === 'create')
        await tx.studyField.create({ data: { id: change.id, ...data } });
      else await tx.studyField.update({ where: { id: change.id }, data });
    }
  }
  for (const { action, studyFieldId, specialtyId } of report.links) {
    if (action === 'create')
      await tx.studyFieldSpecialty.create({
        data: { studyFieldId, specialtyId },
      });
  }
}

export async function importCatalog(
  prisma: PrismaClient,
  input: Catalog | ActiveCatalog,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<CatalogReport> {
  // V2 remains supported for historical fixtures. The CLI accepts only V3.
  const catalog =
    input.version === 3 ? validateActiveCatalog(input) : validateCatalog(input);
  return prisma.$transaction(
    async (tx) => {
      const report: CatalogReport = {
        dryRun,
        changes: [],
        links: [],
        conflicts: [],
      };
      const domains = await tx.domain.findMany({
        select: { id: true, label: true },
      });
      const specialties = await tx.specialty.findMany({
        select: { id: true, label: true, domainId: true },
      });
      const fields = await tx.studyField.findMany({
        select: { id: true, label: true },
      });
      const links = new Set(
        (await tx.studyFieldSpecialty.findMany()).map(
          (link) => `${link.studyFieldId}/${link.specialtyId}`,
        ),
      );

      function planEntry(
        entity: CatalogChange['entity'],
        rows: { id: string; label: string; domainId?: string }[],
        entry: { id?: string; label: string },
        domainId?: string,
      ) {
        const matches = rows.filter(
          (row) => normalizeLabel(row.label) === normalizeLabel(entry.label),
        );
        if (matches.length > 1)
          report.conflicts.push(`Ambiguous ${entity} label: ${entry.label}`);
        const existing = entry.id
          ? rows.find((row) => row.id === entry.id)
          : matches[0];
        const conflict = matches.find(
          (row) => row.id !== (entry.id ?? existing?.id),
        );
        if (conflict)
          report.conflicts.push(
            `${entity} "${entry.label}": file ID ${entry.id} conflicts with existing ID ${conflict.id}; reconcile the file with the existing UUID before importing`,
          );
        let action: CatalogChange['action'] = 'create';
        if (existing) {
          action =
            entry.id && existing.label !== entry.label ? 'rename' : 'unchanged';
        }
        const change: CatalogChange = {
          entity,
          id: existing?.id ?? entry.id ?? randomUUID(),
          label: entry.label,
          domainId,
          action,
        };
        if (action === 'rename' && existing)
          change.previousLabel = existing.label;
        report.changes.push(change);
        return change.id;
      }

      const specialtyIds = new Map<string, string>();
      for (const domain of catalog.domains) {
        const domainId = planEntry('domain', domains, domain);
        const domainSpecialties = specialties.filter(
          (row) => row.domainId === domainId,
        );
        for (const item of domain.specialties) {
          const entry = typeof item === 'string' ? { label: item } : item;
          if ('id' in entry) {
            const existing = specialties.find((row) => row.id === entry.id);
            if (existing && existing.domainId !== domainId)
              report.conflicts.push(
                `Specialty ${entry.id} already belongs to domain ${existing.domainId}; domain changes require explicit handling`,
              );
          }
          const specialtyId = planEntry(
            'specialty',
            domainSpecialties,
            entry,
            domainId,
          );
          specialtyIds.set(
            specialtyKey(domain.label, entry.label),
            specialtyId,
          );
        }
      }
      for (const field of catalog.studyFields) {
        const studyFieldId = planEntry('studyField', fields, field);
        const allowedIds =
          'allowedSpecialtyIds' in field
            ? field.allowedSpecialtyIds
            : field.allowedSpecialties.map(
                (pair) =>
                  specialtyIds.get(specialtyKey(pair.domain, pair.specialty))!,
              );
        for (const specialtyId of allowedIds) {
          report.links.push({
            studyFieldId,
            specialtyId,
            action: links.has(`${studyFieldId}/${specialtyId}`)
              ? 'unchanged'
              : 'create',
          });
        }
      }
      // Build and validate the entire plan before the first write.
      if (dryRun) return report;
      if (report.conflicts.length) throw new Error(report.conflicts.join('\n'));
      await applyCatalogPlan(tx, report);
      return report;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 60000,
    },
  );
}
