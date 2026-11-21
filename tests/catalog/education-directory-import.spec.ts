import { readDirectory } from '@/modules/catalog/import-education-directory';
import { normalizeSchoolSearch } from '@/modules/catalog/education-directory-keys';

const sample = {
  action_de_formation_af_identifiant_onisep: 'AF.100',
  ens_url_et_id_onisep:
    'https://www.onisep.fr/http/redirection/etablissement/slug/ENS.10',
  lieu_denseignement_ens_libelle: 'My Digital School Grenoble',
  ens_commune: 'Saint-Martin-d’Hères',
  ens_code_uai: '0383585R',
  formation_for_libelle: 'Formation test',
  for_url_referentiel: 'https://www.francecompetences.fr/recherche/rncp/40363/',
  for_niveau_de_sortie: 'bac + 5',
};

it('conserve deux lieux pour la même action et indexe les noms usuels', () => {
  const { campuses, offers } = readDirectory([
    sample,
    { ...sample, ens_url_et_id_onisep: 'https://www.onisep.fr/ENS.11' },
  ]);
  expect(offers.map((offer) => offer.id)).toEqual([
    'ENS.10:AF.100',
    'ENS.11:AF.100',
  ]);
  expect(offers[0].rncp).toBe('40363');
  for (const q of [
    'my digitalschool',
    'MDS Grenoble',
    'Saint-Martin-d’Hères',
    '0383585R',
  ]) {
    expect(campuses[0].searchKey).toContain(normalizeSchoolSearch(q));
  }
});

it('refuse un export vide, incomplet ou dupliqué avant écriture', () => {
  for (const rows of [[], [{}], [sample, sample]])
    expect(() => readDirectory(rows)).toThrow();
});
