# Catalogue EPOLIA

## Fichiers

- `approved.json` : catalogue initial au format V3, avec UUID permanents.
- `archive/catalog-v2.json` : ancienne proposition conservée comme référence.
- `../catalog.ts` : validation, préparation de l'import et écritures Prisma.

Les API lisent PostgreSQL. Le JSON sert à initialiser le catalogue ; il n'est
pas chargé à chaque requête. Les nouvelles entrées ne nécessitent pas de
migration Prisma.

## Format et identifiants

Chaque domaine, spécialité et famille d'études possède un `id` UUID et un
`label`. Les domaines contiennent leurs `specialties` ; les familles portent
les `allowedSpecialtyIds`, qui référencent les UUID des spécialités.

- Pour ajouter une entrée, attribuer un nouvel UUID et déclarer ses liens.
- Pour la renommer, conserver son UUID et modifier uniquement le libellé.
- Si le même libellé existe déjà avec un autre UUID, l'import signale un conflit.
  Réconcilier le fichier avec les UUID existants avant de poursuivre.

Les UUID fournis conviennent à une base neuve. Les références historiques
ne doivent pas être remplacées ou rattachées automatiquement par leur libellé.

## Commandes

```sh
npm run catalog:check
npm run catalog:import -- --dry-run
npm run catalog:import
```

`catalog:check` vérifie les formats, UUID, doublons et correspondances sans
connexion à la base. Le catalogue actif peut évoluer indépendamment de l'archive.

L'import utilise la configuration Prisma existante. Le `--dry-run` lit la base
sans écrire et présente les créations, renommages et conflits ; les entrées
inchangées sont comptées. `createdLinks` détaille uniquement les nouvelles
correspondances, avec les UUID et les libellés des familles et des spécialités.
Un conflit produit un code de sortie non nul.

L'import réel recalcule le plan et l'applique dans une transaction Serializable.
Une erreur annule toutes ses écritures. Un conflit concurrent peut nécessiter de
relancer la commande. Les imports répétés ne créent pas de doublons et les
missions conservent leurs snapshots contractuels.

Sur une base partagée, examiner le dry-run, réconcilier les UUID, sauvegarder et
obtenir l'autorisation d'exécution avant import. Prévoir un retour arrière qui
préserve les références utilisées et les écritures ultérieures. Aucun reset ou
effacement implicite n'est effectué par l'import.

## Limites

- Retirer une entrée ou une correspondance du JSON ne la supprime pas en base.
  Les révocations, fusions et changements de domaine exigent un traitement explicite.
- Un réimport peut rétablir un libellé modifié depuis la base. La gestion du
  catalogue par l'administration et la protection de ses modifications relèvent de #82.
- Les propositions étudiantes relèvent de #71 ; elles ne donnent pas de droit
  avant validation.
- Les familles trop générales ne permettent pas de déduire une langue, un
  instrument, une discipline sportive ou un niveau de cours non précisé.

L'éligibilité exige une correspondance explicite, une formation en cours et un
domaine compatible. La vérification documentaire et la publication restent
distinctes ; un lien de catalogue ne vaut pas vérification du cursus.

## Tests

```sh
npm run lint
npm test -- --runInBand
npm run build
```

Pour les tests PostgreSQL, utiliser une base jetable avec la migration initiale,
`src/catalog/legacy-fixture.sql`, puis la migration additive. Exécuter ensuite :

```sh
CATALOG_TEST_DATABASE_URL=<URL_TEST> npm test -- --runInBand
```

La CI dispose d'un job dédié. La suite couvre notamment dry-run, rejeu,
renommage avec liens conservés, collisions, rollback et éligibilité. Le format
V2 reste accepté par la fonction d'import pour les fixtures historiques ; la
commande d'import utilise uniquement le format V3.
