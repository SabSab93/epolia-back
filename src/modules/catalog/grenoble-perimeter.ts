import { normalizeSchoolSearch } from '@/modules/catalog/education-directory-keys';

// Communes membres de Grenoble-Alpes-Métropole (EPCI 200040715), au 21/11/2026.
// https://www.insee.fr/fr/metadonnees/geographie/intercommunalite/200040715-grenoble-alpes-metropole
const municipalities = new Set(
  [
    'Bresson',
    'Brié-et-Angonnes',
    'Champagnier',
    'Champ-sur-Drac',
    'Claix',
    'Corenc',
    'Domène',
    'Échirolles',
    'Eybens',
    'Fontaine',
    'Fontanil-Cornillon',
    'Gières',
    'Grenoble',
    'Le Gua',
    'Herbeys',
    'Jarrie',
    'Meylan',
    'Miribel-Lanchâtre',
    'Montchaboud',
    'Mont-Saint-Martin',
    'Murianette',
    'Notre-Dame-de-Commiers',
    'Notre-Dame-de-Mésage',
    'Noyarey',
    'Poisat',
    'Le Pont-de-Claix',
    'Proveysieux',
    'Quaix-en-Chartreuse',
    'Saint-Barthélemy-de-Séchilienne',
    'Saint-Égrève',
    'Saint-Georges-de-Commiers',
    "Saint-Martin-d'Hères",
    'Saint-Martin-le-Vinoux',
    'Saint-Paul-de-Varces',
    'Saint-Pierre-de-Mésage',
    'Le Sappey-en-Chartreuse',
    'Sarcenas',
    'Sassenage',
    'Séchilienne',
    'Seyssinet-Pariset',
    'Seyssins',
    'La Tronche',
    'Varces-Allières-et-Risset',
    'Vaulnaveys-le-Bas',
    'Vaulnaveys-le-Haut',
    'Venon',
    'Veurey-Voroize',
    'Vif',
    'Vizille',
  ].map(normalizeSchoolSearch),
);

export function isGrenobleCampus(department: string, city: string): boolean {
  const area = normalizeSchoolSearch(department);
  return (
    (area === 'isere' || area === '38') &&
    municipalities.has(normalizeSchoolSearch(city))
  );
}
