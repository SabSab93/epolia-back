import type { Prisma } from '@prisma/client';
import { prisma } from '@/prisma/client';
import { normalizeSchoolSearch } from '@/modules/catalog/education-directory-keys';

const fullStackCourse = 'ENS.23533:AF.133640';
const fullStackTrack = fullStackCourse + ':full-stack';
const campusSelect = { id: true, label: true, city: true, address: true };
const includeCampus = { campus: { select: { label: true } } } as const;

type DirectoryRow = {
  id: string;
  campusId: string;
  label: string;
  level: string | null;
  detail: string | null;
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
    // The MBA track also admits apprentices outside Onisep's initial-training export.
    detail: track ? '2 ans · alternance possible' : row.detail,
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
    where: {
      inGrenobleArea: true,
      AND: words.map((word) => ({ searchKey: { contains: word } })),
    },
    select: campusSelect,
    orderBy: [{ label: 'asc' }, { city: 'asc' }, { id: 'asc' }],
    take: 40,
  });
}

export async function getCampusOffers(campusId: string) {
  const campus = await prisma.educationDirectoryCampus.findUnique({
    where: { id: campusId, inGrenobleArea: true },
    select: {
      label: true,
      offers: { orderBy: [{ label: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!campus) return null;
  const choices = campus.offers.flatMap((offer) => {
    const row = { ...offer, campus: { label: campus.label } };
    return hasFullStackTrack(row)
      ? [asOffer(row, true), asOffer(row)]
      : [asOffer(row)];
  });
  // Some actions have exactly the same public label, duration and modality.
  // Keep both choices and show their source references only for those ties.
  const displayKey = (offer: (typeof choices)[number]) =>
    JSON.stringify([
      offer.label.toLocaleLowerCase('fr'),
      offer.detail?.toLocaleLowerCase('fr'),
    ]);
  const seen = new Set<string>();
  const ambiguous = new Set<string>();
  for (const offer of choices) {
    const key = displayKey(offer);
    if (seen.has(key)) ambiguous.add(key);
    seen.add(key);
  }
  return choices.map((offer) => {
    if (!ambiguous.has(displayKey(offer))) return offer;
    const reference = 'Réf. ' + offer.id.slice(offer.campusId.length + 1);
    return {
      ...offer,
      detail: [offer.detail, reference].filter(Boolean).join(' · '),
    };
  });
}

export async function getCatalogOffer(
  id: string,
  db: Prisma.TransactionClient = prisma,
) {
  const track = id === fullStackTrack;
  const row = await db.educationDirectoryOffer.findUnique({
    where: {
      id: track ? fullStackCourse : id,
      campus: { inGrenobleArea: true },
    },
    include: includeCampus,
  });
  if (!row || (track && !hasFullStackTrack(row))) return null;
  return asOffer(row, track);
}

const previewSelect = {
  reference: true,
  label: true,
  description: true,
} as const;

export async function listServiceCandidates() {
  const services = await prisma.nonCesuServiceCandidate.findMany({
    select: {
      ...previewSelect,
      family: true,
      studyDomain: true,
      otherStudyDomain: true,
      trainingExamples: true,
    },
    orderBy: { reference: 'asc' },
  });
  return services.map((service) => ({
    ...service,
    id: 'hors-cesu-' + service.reference,
  }));
}

export async function listOfferCandidates(offerId: string) {
  const services = await prisma.nonCesuServiceCandidate.findMany({
    select: previewSelect,
    where: { offers: { some: { offerId } } },
    orderBy: { reference: 'asc' },
  });
  return services.map(({ reference, label, description }) => ({
    id: 'hors-cesu-' + reference,
    label,
    description,
  }));
}
