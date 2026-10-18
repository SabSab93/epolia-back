import { join } from 'node:path';
import { assertApprovedCatalog, readCatalog } from './catalog';

const candidate = readCatalog(
  join(__dirname, 'catalog', 'archive', 'catalog-v2.json'),
);
const approved = readCatalog(join(__dirname, 'catalog', 'approved.json'));
assertApprovedCatalog(candidate, approved);

console.log({
  candidateDomains: candidate.domains.length,
  candidateSpecialties: candidate.domains.reduce(
    (count, domain) => count + domain.specialties.length,
    0,
  ),
  candidateStudyFields: candidate.studyFields.length,
  candidateAssociations: candidate.studyFields.reduce(
    (count, field) => count + field.allowedSpecialties.length,
    0,
  ),
  approvedAssociations: approved.studyFields.reduce(
    (count, field) => count + field.allowedSpecialties.length,
    0,
  ),
});
