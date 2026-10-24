# Epolia Backend

API de la marketplace Epolia, un projet de fin de master mettant en relation des particuliers et des étudiants pour des services de proximité.

Le backend utilise Express, TypeScript, PostgreSQL et Prisma. Swagger documente l'API et Jest couvre les routes.

## Démarrage local

Prérequis : Node.js 20, npm et Docker avec Docker Compose.

```bash
cp .env.example .env
npm ci
docker compose up -d postgres
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Adapter les variables de `.env`, notamment `JWT_SECRET`. La configuration fournie utilise PostgreSQL sur le port `5433` et l'API sur le port `3000`.

La migration initiale du MLD final est prévue pour une base neuve. Une base utilisant les anciennes migrations nécessite une migration de transition pour conserver ses données.

## Environnements

Le projet utilise les mêmes variables pour les environnements local, développement et production. Les valeurs changent selon l'environnement, pas la structure de configuration.

Variables principales :

- `NODE_ENV` : uniquement `development`, `test` ou `production`. Toute autre valeur explicite bloque le démarrage. Sans cette variable, le lancement local utilise `development` ; l'image Docker utilise `production` par défaut.
- `PORT` : port HTTP du backend, `3000` par défaut.
- `DATABASE_URL` et `DIRECT_URL` : connexions PostgreSQL utilisées par Prisma. Avec Supabase, `DATABASE_URL` peut utiliser une connexion poolée ; `DIRECT_URL` doit utiliser la connexion directe pour les migrations.
- `CORS_ORIGIN` : origines web autorisées, séparées par des virgules.
- `JWT_SECRET` : obligatoire en production, avec au moins 32 caractères hors espaces de début et de fin. Les valeurs de développement `dev-secret-change-me` et `change-me-in-local-env` sont refusées.

Exemple local :

```dotenv
NODE_ENV=development
JWT_SECRET=change-me-in-local-env
CORS_ORIGIN=http://localhost:3000,http://localhost:8081
```

En local, un `CORS_ORIGIN` absent ou égal à `*` autorise toutes les origines. En production, une liste non vide d'origines connues est obligatoire, et `*` est refusé, même dans une liste :

```dotenv
NODE_ENV=production
CORS_ORIGIN=https://epolia.fr,https://admin.epolia.fr
```

Ajouter un `JWT_SECRET` généré avec une source cryptographique sécurisée, par exemple avec `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, et le fournir hors du dépôt. La longueur minimale seule ne garantit pas la qualité du secret. En déploiement, conserver `NODE_ENV=production` et ne pas injecter le fichier `.env` local dans le conteneur.

Les applications mobiles natives ne sont pas bloquées par CORS de la même façon qu'un navigateur, mais leurs vues web éventuelles le sont.

Le fichier `.env` reste local et ne doit pas être commité.

## API

| Point d'entrée | URL locale                       |
| -------------- | -------------------------------- |
| Swagger        | http://localhost:3000/api/docs   |
| Health check   | http://localhost:3000/api/health |

Les routes utilisent le préfixe `/api`. L'authentification locale, les profils utilisateur et étudiant, et l'administration des utilisateurs sont implémentés.

Le schéma Prisma couvre le MLD final, y compris les domaines dont les routes restent à développer.

## Majorité et transition des comptes existants

`POST /api/auth/register` exige `birthDate` au format civil `YYYY-MM-DD`,
avant la création du compte, pour CUSTOMER et STUDENT. L'âge est calculé en
dates UTC ; les 18 ans sont atteints à minuit UTC, et au 1er mars en année
non bissextile pour une naissance le 29 février. La date est déclarative :
elle ne constitue pas une vérification d'identité. Elle n'est pas renvoyée
dans les réponses utilisateur ni inscrite dans les JWT.

Un compte historique sans date conserve `NULL` et reste bloqué au login,
sur les routes protégées, à l'attribution de rôles et à la réactivation.
Il ne faut ni lui inventer une date ni ajouter une collecte différée au
parcours utilisateur. Sa suspension, l'enregistrement de sa demande de
suppression et son anonymisation doivent néanmoins rester possibles par
un administrateur autorisé. Le trigger de la migration corrective impose
une date aux nouvelles lignes non supprimées, interdit d'effacer une date
connue hors suppression et interdit une réactivation sans date. Il laisse
les anciennes lignes sans date être gérées administrativement.

### Bascule opérateur avant ouverture du trafic

Cette procédure nécessite un accès opérateur autorisé à la base cible.
Elle ne s'exécute ni au démarrage de l'application ni automatiquement en CI.
Ne pas lancer les commandes sur une base partagée sans autorisation de
l'environnement concerné.

1. Avant la bascule, identifier un administrateur existant et actif dont la
   date de naissance réelle est confirmée par un processus autorisé.
   Si cette information n'est pas disponible, interrompre la bascule :
   aucun rôle ou compte n'est créé par la procédure, aucun compte n'est réactivé.
2. Sauvegarder la base selon la procédure de l'environnement et maintenir
   le trafic fermé pendant la transition. Configurer `DATABASE_URL` et
   `DIRECT_URL` pour la bonne base, puis appliquer **toutes** les migrations
   avec `npx prisma migrate deploy`. Ne pas modifier la migration initiale
   de naissance si elle a déjà été appliquée : la nouvelle migration la corrige.
3. Vérifier l'accès d'administration disponible :

   ```bash
   npm run users:prepare-majority -- --check
   ```

   Cette commande est en lecture seule ; elle termine en erreur si aucun
   administrateur actif n'a une date adulte. Si elle réussit, aucun remplissage
   des anciennes dates n'est nécessaire pour maintenir l'administration.
4. Si nécessaire, fournir par **entrée standard** un objet JSON contenant
   `userId` (UUID de l'administrateur existant) et `birthDate` (date civile
   réellement confirmée). Préparer cette entrée dans un fichier temporaire
   protégé, hors du dépôt ; ne pas inscrire la date dans les arguments de la
   commande, l'historique du shell, les logs ou les exemples nominatifs.

   ```bash
   npm run users:prepare-majority -- --apply < /chemin/protege/admin-majority.json
   npm run users:prepare-majority -- --check
   ```

   `--apply` ne remplit qu'une date absente sur un administrateur **déjà actif**.
   Il refuse les dates invalides/mineures, les comptes ordinaires, suspendus
   ou supprimés et le remplacement d'une date connue. Répéter la même entrée
   est sans effet. Il n'ajoute aucun rôle et ne change aucun statut.
   Sans les dépendances de développement, le build propose les mêmes modes :
   `node dist/scripts/prepare-majority-admin.js --check` et `--apply` avec
   la même entrée standard.
5. Vérifier connexion, `/api/auth/me` et une route admin avec le compte retenu,
   sans enregistrer ses données sensibles. Retirer le fichier temporaire selon
   les règles de l'environnement, puis ouvrir le trafic seulement si les
   vérifications réussissent. Les autres comptes sans date restent bloqués.

Front #2/#5 doivent transmettre `birthDate` à l'inscription et gérer les
erreurs `BIRTH_DATE_REQUIRED` / `ADULT_REQUIRED`, sans proposer une saisie
de naissance après création du compte. Le second rôle reste suivi dans #69.

## Imports internes

Utiliser des alias pour les imports locaux, y compris dans les tests :

- `@/...` référence le dossier `src/`.
- `@root/...` référence la racine du dépôt, notamment `@root/prisma/catalog`.

Les alias sont configurés dans TypeScript et Jest. Les scripts TypeScript
chargent `tsconfig-paths/register` ; le build utilise `tsc-alias`.

## Commandes

| Commande                  | Usage                                                 |
| ------------------------- | ----------------------------------------------------- |
| `npm run dev`             | Démarrer en développement                             |
| `npm run build`           | Compiler dans `dist/`                                 |
| `npm run start`           | Démarrer la version compilée                          |
| `npm run lint`            | Vérifier le code hors fichiers de tests               |
| `npm run test`            | Exécuter les tests Jest                               |
| `npm run format`          | Formater les fichiers TypeScript                      |
| `npm run prisma:generate` | Générer le client Prisma                              |
| `npm run prisma:migrate`  | Appliquer les migrations et en créer en développement |
| `npm run prisma:studio`   | Ouvrir Prisma Studio                                  |

Avant une PR :

```bash
npm run lint
npm run test
npm run build
```

## CI GitHub Actions

La CI se déclenche sur les pushes vers `main` et sur les Pull Requests vers `main`, ouvertes, mises à jour ou rouvertes. Cela évite de vérifier deux fois un même push sur une branche avec une PR ouverte.

Elle exécute un seul job qui vérifie :

1. `npm ci`
2. `npm run prisma:generate`
3. `npm run lint`
4. `npm run test`
5. `npm run build`

La CI ne déploie pas l'application et ne crée aucune ressource externe.

La protection de `main` doit exiger le check `Install, lint, test and build` avant fusion.
