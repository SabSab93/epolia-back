# Catalogue et eligibilite par formation

## Sources et validation

- `archive/catalog-v2.json` conserve integralement la proposition V2 fournie : 24 domaines,
  466 specialites, 23 familles d'etudes et 1 216 correspondances.
- `approved.json` est le seul fichier importe en base. Il est actuellement vide :
  aucune correspondance n'a ete officiellement approuvee.
- Le JSON n'est jamais lu par les routes. PostgreSQL est la source en runtime.

### Decision metier pour la future V3

Aucune des 1 216 correspondances V2 n'est approuvee en bloc. La V2 reste une
archive de travail : ses 466 specialites sont conservees pour reconstruire les
correspondances pedagogiques, sans activation ni suppression de references.
Le seed actif reste vide tant qu'aucune correspondance n'est validee.

Une prestation doit decouler directement de la formation suivie par l'etudiant.
Les competences personnelles, loisirs et connaissances acquises hors cursus
ne donnent aucun droit. Une famille d'etudes n'ouvre jamais automatiquement un
domaine entier. La V3 devra contenir des correspondances explicites, validees
individuellement ; aucune association V2 ne sera reconduite automatiquement.

Dans l'attente, seuls les travaux techniques independants du contenu metier
sont autorises. Cette decision n'ajoute aucune table ni migration.

Schema V2 (exemple de structure, pas une approbation metier) :

```json
{
  "version": 2,
  "domains": [{ "label": "Web", "specialties": ["Site vitrine"] }],
  "studyFields": [
    {
      "label": "Informatique",
      "allowedSpecialties": [{ "domain": "Web", "specialty": "Site vitrine" }]
    }
  ]
}
```

`npm run catalog:check` valide les deux fichiers et verifie que le catalogue
approuve est un sous-ensemble du candidat. Les labels vides, doublons apres
normalisation NFC/espaces/casse, references manquantes et mauvaises versions sont
rejetes. Une paire doit designer une specialite de son domaine exact.

`npm run catalog:import` importe uniquement `approved.json`. Tant qu'il est vide,
la commande n'effectue aucune ecriture. Ne pas copier le candidat dans ce fichier
sans validation metier explicite. L'import sur une base partagee requiert une
autorisation distincte.

L'import utilise une transaction et les cles uniques existantes pour les upserts.
Il conserve les UUID, retrouve les labels existants apres normalisation et
n'efface aucun domaine, specialite, formation, tarif, profil, mission ou lien
existant. Des collisions de labels normalises deja en base provoquent un echec
explicite : elles doivent etre reconciliees manuellement.
L'import ajoute des references ; enlever une paire du fichier ne revoque pas
automatiquement un lien deja importe. Une revocation doit etre une operation
administrative explicite avec recalcul des profils concernes.

Les libelles uniques servent uniquement a l'import. Toutes les FK utilisent des
UUID. Un renommage ou une traduction devra conserver l'UUID et faire l'objet
d'une reconciliation explicite ; ne pas traiter un nouveau libelle comme un
renommage automatique.

## Schema avant / apres

Socle constate : commit `bb39d18` de main, apres integration de #60 via #64.
Aucune PR ouverte au moment de l'audit. Prisma et client : 6.19.3.

Tables reutilisees : `domains`, `specialties`, `student_profiles`,
`student_specialties`, `student_educations`, `mission_items`.

Ajouts exacts : **2 tables, 5 colonnes au total**, dont 1 colonne sur une table
existante :

| Table                   | Ajout                                  | Contraintes                                     |
| ----------------------- | -------------------------------------- | ----------------------------------------------- |
| study_fields            | id UUID, label TEXT                    | PK UUID, label unique non null                  |
| study_field_specialties | study_field_id UUID, specialty_id UUID | PK composite, 2 FK restrict, index specialty_id |
| student_educations      | study_field_id UUID nullable           | FK restrict, index study_field_id               |

La famille d'etudes est un fait de reference, la formation individuelle conserve
son titre/ecole/niveau/dates, et la jonction porte uniquement la liste blanche.
Aucun CSV/JSON d'identifiants, duplication de libelle ou table student_study_fields.
Le domaine principal reste obligatoire.

Migration additive : `../migrations/20261014160000_study_field_eligibility/migration.sql`.
Elle contient exclusivement CREATE TABLE, CREATE INDEX et ALTER TABLE ADD
(column/FK). Aucune migration appliquee n'est modifiee.

## Contrat API

Les GET publics de domaines et specialites restent un catalogue d'affichage,
sans droit d'exercer. `GET /api/study-fields` retourne les familles officielles
sous la forme `[{ id, label }]`.

Avec un Bearer token et le role STUDENT (egalement valide en double role) :

| Route                                        | Comportement                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| GET /api/student-educations/me               | Formations du compte courant, famille incluse ou null                      |
| POST /api/student-educations                 | Declaration avec title obligatoire, famille optionnelle                    |
| PATCH /api/student-educations/:educationId   | Modification d'une formation possedee et recalcul transactionnel           |
| DELETE /api/student-educations/:educationId  | Suppression d'une formation possedee et recalcul transactionnel            |
| GET /api/student-specialties/eligible        | Union exacte des specialites des formations, filtree par domaine principal |
| GET /api/student-specialties/me              | Associations et tarifs du compte courant                                   |
| POST /api/student-specialties                | Ajout autorise par une formation ET le domaine principal                   |
| PATCH /api/student-specialties/:specialtyId  | Controle d'eligibilite repete avant modification du tarif                  |
| DELETE /api/student-specialties/:specialtyId | Suppression de l'association, jamais de la reference                       |
| PATCH /api/student-profiles/me               | Changement de domaine avec nettoyage transactionnel                        |

Exemple de declaration :

```json
{
  "title": "Licence informatique",
  "school": "Universite",
  "level": "BAC+3",
  "startDate": "2025-09-01",
  "studyFieldId": "9324c24d-a476-41db-a0e3-12479bd81ed7"
}
```

Reponse 201 : les champs declares, `id`, `studentId` du compte courant,
`studyFieldId`, `studyField: { id, label }`, `createdAt`, `updatedAt`.
Une declaration libre avec `studyFieldId: null` reste lisible mais n'ouvre rien.

Exemple de tarif :

```json
{
  "specialtyId": "472e5d8d-e7bf-4513-a812-7970ecb65e9c",
  "pricingType": "HOURLY",
  "priceCents": 2500,
  "pricingDetails": "Forfait de presentation"
}
```

Reponse 201 : association, tarif et reference `specialty` (incluant le domaine).
Un PATCH de tarif peut omettre specialtyId et les champs non modifies.
Prix en centimes entier entre 1 et 2147483647 (limite de stockage PostgreSQL,
pas une fourchette de prix metier). Tarification HOURLY ou FIXED.

Erreurs : 400 validation/domaine incompatible, 401 sans session, 403 role absent
ou `SPECIALTY_NOT_ELIGIBLE`, 404 reference/profil/formation possedee absente,
409 doublon etudiant-specialite. Les ID de proprietaire fournis par le client
ne sont pas utilises. Une formation d'autrui retourne 404.

## Catalogue actif vide et onboarding

Sur une base propre, les GET de catalogue retournent des listes vides et aucune
specialite ne peut etre selectionnee. Sur une base historique, les references
existantes restent consultables, mais sans lien formation-specialite en base
les POST/PATCH de specialites sont refuses. L'absence de correspondances n'ouvre
jamais un domaine entier.

Ordre le moins invasif avec domain_id obligatoire : consulter les domaines,
creer un profil DRAFT avec un domaine provisoire, declarer sa formation et sa
famille, puis confirmer/changer le domaine et lire les specialites eligibles.
Aucune modification de cardinalite du domaine principal.

Les changements d'education, de domaine et de specialites verrouillent la meme
ligne student_profiles dans leur transaction. Si une formation change ou
disparait, l'union est recalculee ; seules les associations devenues ineligibles
du profil sont retirees. Une autre formation autorisant la meme specialite la
conserve. Les missions et leurs snapshots restent intacts.
Une modification d'education ou l'ajout d'une offre ramene un profil VISIBLE a
DRAFT. Un changement de domaine ramene egalement un profil VISIBLE a DRAFT.

## Verification et publication (#55 / #70)

Une formation declaree permet de preparer le brouillon ; elle n'est pas une
preuve du cursus. Les POST/PATCH de profil ne permettent plus status VISIBLE :
403 PROFILE_PUBLICATION_NOT_AVAILABLE, en attendant le processus de publication.

Le GET public d'un ancien profil exige VISIBLE, la derniere verification scolaire
APPROVED et l'absence de specialite ineligible. Cette lecture est serialisee avec
les mutations du profil. Le document scolaire existant n'est pas lie a chaque
formation et ne prouve donc pas son contenu. Les profils historiques VISIBLE
doivent etre revus avant ouverture publique. #55/#70 devront faire verifier par
un administrateur la formation et son rattachement precis, puis autoriser la
publication. Le controle du referentiel ne constitue aucune certification.

## Donnees existantes et reconciliation

Aucune base DEV/PROD n'a ete consultee ou migree. Le nombre de lignes reelles et
l'execution eventuelle du seed V1 restent a confirmer par un audit autorise.
Les tests utilisent uniquement des bases PostgreSQL jetables et des donnees
fictives.

Impacts du SQL propose sur une base peuplee : les anciennes formations restent
avec study_field_id NULL ; aucun backfill automatique par titre de diplome.
La creation des FK/index prend des verrous SQL, a planifier selon le volume reel.
Les lignes historiques et les tarifs ne sont pas modifies par la migration.
Les specialites historiques restent presentes mais n'ouvrent pas de droit via
la nouvelle API tant qu'elles ne sont pas autorisees par une formation rattachee.

Avant toute migration sur une base reelle peuplee, presenter le SQL et les
impacts, obtenir l'autorisation d'execution, sauvegarder si partagee puis auditer :
formations sans famille, profils VISIBLE, offres historiques et liens de missions.
Apres validation metier, importer uniquement le sous-ensemble approuve ; rattacher
explicitement les formations apres revue administrative.
Mettre les profils a revoir en DRAFT et traiter leurs associations dans une
operation approuvee. Ne jamais purger les anciennes references pour remplacer
le V1 ; conserver les UUID lies aux missions. Les cas ambigus restent en attente.

## Verification reproductible

`npm run catalog:check`, `npx prisma validate`, `npm run prisma:generate`,
`npm run lint`, `npm test -- --runInBand`, `npm run build`.

Les tests PostgreSQL sont optionnels dans la suite habituelle. Pour les lancer,
utiliser exclusivement une base de test dediee :

1. Charger le socle MLD et `src/catalog/legacy-fixture.sql` sur une base jetable.
2. Marquer la migration initiale appliquee avec Prisma migrate resolve.
3. Appliquer la migration additive sur cette base ; appliquer les deux migrations
   sur une seconde base jetable vide.
4. Lancer `CATALOG_TEST_DATABASE_URL=<URL_TEST> npm test -- --runInBand`.

La suite d'integration ajoute des donnees fictives et ne doit pas viser DEV/PROD.
Elle controle les donnees historiques, les UUID apres deux imports, la
normalisation des labels, les droits precis, les formations multiples,
les declarations sans rattachement, les acces d'autrui, le retrait d'offres,
la conservation des missions et la concurrence reelle des transactions.
Le catalogue synthetique des tests n'est jamais importe dans le seed actif.

## Resultats verifies le 14 octobre 2026

- Prisma validate et generate : succes (6.19.3).
- Migration sur PostgreSQL jetable vide et peuple de donnees fictives : succes.
- Comparaison base migree / schema Prisma : aucune difference.
- Suite complete avec CATALOG_TEST_DATABASE_URL : 10 suites, 148 tests reussis,
  dont 23 tests PostgreSQL.
- Verification avant commits sans base de test : 125 tests reussis,
  23 tests PostgreSQL ignores ; lint, build et catalog:check reussis.
- Seed synthetique importe deux fois : UUID et nombres de references stables.
- Seed actif vide : succes sans connexion PostgreSQL ni ecriture.
- Lint : succes, aucun avertissement. Build et typage des scripts Prisma : succes.
- References et parametres de chemin OpenAPI : valides.
- Candidat V2 identique au fichier fourni ; catalogue actif strictement vide.

Fichiers concernes : schema Prisma et nouvelle migration ; package.json et
tsconfig.build.json ; app.ts et Swagger ; routes domaines, familles, formations,
specialites et profils ; services/student-specialties.ts ; scripts catalog.ts,
check-catalog.ts et seed-catalog.ts ; JSON et documentation de catalogue ; tests
de routes et de catalogue, dont la fixture SQL historique.

Aucune migration ni import sur DEV/PROD.
