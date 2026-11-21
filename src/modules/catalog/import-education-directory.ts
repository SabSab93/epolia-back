import { readFile } from 'node:fs/promises';
import { prisma } from '@/prisma/client';
import { schoolSearchKey } from '@/modules/catalog/education-directory-keys';

const source =
  'https://data.onisep.fr/api/v1/downloads/605344579a7d7/605344579a7d7.json';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readDirectory(rows: unknown) {
  if (!Array.isArray(rows) || !rows.length)
    throw new Error('Export Onisep vide ou illisible.');
  const campuses = new Map<
    string,
    { id: string; label: string; city: string; searchKey: string }
  >();
  const offers = new Map<
    string,
    {
      id: string;
      campusId: string;
      label: string;
      level: string | null;
      rncp: string | null;
    }
  >();
  for (const row of rows) {
    const campusId = /\/(ENS\.\d+)\/?$/.exec(
      text(row?.ens_url_et_id_onisep),
    )?.[1];
    const action = text(row?.action_de_formation_af_identifiant_onisep);
    const school = text(row?.lieu_denseignement_ens_libelle);
    const city = text(row?.ens_commune);
    const label = text(row?.formation_for_libelle);
    if (!campusId || !/^AF\.\d+$/.test(action) || !school || !city || !label) {
      throw new Error('Ligne incomplète dans l’export Onisep. Import annulé.');
    }
    const id = campusId + ':' + action;
    if (offers.has(id))
      throw new Error('Offre en double dans l’export : ' + id);
    campuses.set(campusId, {
      id: campusId,
      label: school,
      city,
      searchKey: schoolSearchKey(school, city, text(row.ens_code_uai)),
    });
    offers.set(id, {
      id,
      campusId,
      label,
      level: text(row.for_niveau_de_sortie) || null,
      rncp:
        /\/rncp\/(\d+)\/?$/i.exec(text(row.for_url_referentiel))?.[1] ?? null,
    });
  }
  return { campuses: [...campuses.values()], offers: [...offers.values()] };
}

async function main() {
  const path = process.argv[2];
  let rows: unknown;
  if (path) rows = JSON.parse(await readFile(path, 'utf8'));
  else {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(
        'Échec du téléchargement Onisep : HTTP ' + response.status,
      );
    rows = await response.json();
  }
  const { campuses, offers } = readDirectory(rows);
  await prisma.$transaction(
    async (tx) => {
      const previousCount = await tx.educationDirectoryOffer.count();
      if (offers.length < previousCount / 2)
        throw new Error(
          'Plus de la moitié des offres manquent. Vérifiez le fichier national.',
        );
      await tx.educationDirectoryOffer.deleteMany();
      await tx.educationDirectoryCampus.deleteMany();
      for (let i = 0; i < campuses.length; i += 1000)
        await tx.educationDirectoryCampus.createMany({
          data: campuses.slice(i, i + 1000),
        });
      for (let i = 0; i < offers.length; i += 1000)
        await tx.educationDirectoryOffer.createMany({
          data: offers.slice(i, i + 1000),
        });
    },
    { isolationLevel: 'Serializable', timeout: 120_000 },
  );
  console.log(
    campuses.length +
      ' campus et ' +
      offers.length +
      ' offres Onisep importés.',
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
