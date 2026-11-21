import type { Prisma } from '@prisma/client';
import { prisma } from '@/prisma/client';
import { normalizeSchoolSearch } from '@/modules/catalog/education-directory-keys';

const fullStackCourse = 'ENS.23533:AF.133640';
const fullStackTrack = fullStackCourse + ':full-stack';
const campusSelect = { id: true, label: true, city: true };
const includeCampus = { campus: { select: { label: true } } } as const;

type DirectoryRow = {
  id: string;
  campusId: string;
  label: string;
  level: string | null;
  rncp: string | null;
  campus: { label: string };
};

function asOffer(row: DirectoryRow, track = false) {
  return {
    id: track ? fullStackTrack : row.id,
    campusId: row.campusId,
    campusLabel: row.campus.label,
    label: track ? 'MBA Développeur Full-stack' : row.label,
    level: row.level,
    studyFieldId: null,
  };
}

function hasFullStackTrack(row: DirectoryRow) {
  return row.id === fullStackCourse && row.rncp === '40363';
}

export async function searchCampuses(q: string) {
  const words = q.split(/\s+/).map(normalizeSchoolSearch).filter(Boolean);
  if (!words.length) return [];
  return prisma.educationDirectoryCampus.findMany({
    where: { AND: words.map((word) => ({ searchKey: { contains: word } })) },
    select: campusSelect,
    orderBy: [{ label: 'asc' }, { city: 'asc' }, { id: 'asc' }],
    take: 40,
  });
}

export async function getCampusOffers(campusId: string) {
  const campus = await prisma.educationDirectoryCampus.findUnique({
    where: { id: campusId },
    select: {
      label: true,
      offers: { orderBy: [{ label: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!campus) return null;
  return campus.offers.flatMap((offer) => {
    const row = { ...offer, campus: { label: campus.label } };
    return hasFullStackTrack(row)
      ? [asOffer(row, true), asOffer(row)]
      : [asOffer(row)];
  });
}

export async function getCatalogOffer(
  id: string,
  db: Prisma.TransactionClient = prisma,
) {
  const track = id === fullStackTrack;
  const row = await db.educationDirectoryOffer.findUnique({
    where: { id: track ? fullStackCourse : id },
    include: includeCampus,
  });
  if (!row || (track && !hasFullStackTrack(row))) return null;
  return asOffer(row, track);
}

// Proposition éditoriale du pilote. Ces identifiants ne sont pas des spécialités activables.
export function getOfferCandidates(id: string) {
  if (id !== fullStackTrack) return [];
  return [
    {
      id: 'installation-numerique',
      label: 'Installation de matériel et de logiciels',
      description:
        'Aider à mettre en service un ordinateur ou un logiciel courant au domicile du particulier.',
    },
    {
      id: 'aide-numerique',
      label: 'Aide numérique à domicile',
      description:
        'Accompagner le particulier pour utiliser sa messagerie ou rejoindre une visioconférence.',
    },
    {
      id: 'initiation-bureautique',
      label: 'Initiation à la bureautique',
      description:
        'Apprendre à rédiger et à mettre en forme un courrier personnel.',
    },
  ];
}
