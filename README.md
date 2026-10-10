# Epolia Backend

Backend de la marketplace Epolia.

Epolia est une application fictive de fin de master permettant de mettre en relation des particuliers et des étudiants pour des services de proximité.

## Stack

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma
- Swagger / OpenAPI
- Jest

## Architecture cible

Le backend démarre sous forme de monolithe Express simple.

Ce choix permet :
- d'éviter des microservices prématurés ;
- de garder un backend maintenable ;
- d'ajouter les modules métier progressivement ;
- de préparer une évolution future si le projet grandit.

## Installation locale

Installer les dépendances :

```bash
npm install
```

Créer la configuration locale :

```bash
cp .env.example .env
```

Le fichier `.env` reste local et ne doit pas être commité.

## Environnements

Le projet utilise les mêmes variables pour les environnements local, développement et production. Les valeurs changent selon l'environnement, pas la structure de configuration.

Variables principales :

- `NODE_ENV` : `development`, `test` ou `production`.
- `PORT` : port HTTP du backend, `3000` par défaut.
- `DATABASE_URL` et `DIRECT_URL` : connexions PostgreSQL utilisées par Prisma.
- `CORS_ORIGIN` : origines web autorisées, séparées par des virgules.
- `JWT_SECRET` : secret JWT, obligatoire et non générique en production.

En local, `CORS_ORIGIN` peut contenir les URLs du front web et du serveur de développement mobile, par exemple `http://localhost:3000,http://localhost:8081`. En production, `CORS_ORIGIN` doit être limité à des origines connues. Les applications mobiles natives ne sont pas bloquées par CORS de la même façon qu'un navigateur, mais leurs vues web éventuelles le sont.

## PostgreSQL local

Démarrer PostgreSQL avec Docker Compose :

```bash
docker compose up -d postgres
```

Le service expose PostgreSQL sur `127.0.0.1:5433` pour éviter les conflits avec un PostgreSQL local sur `5432`.

## Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
```

Voir aussi [docs/prisma-postgresql.md](docs/prisma-postgresql.md) pour les commandes PostgreSQL, Prisma et le test de connexion.

Les modèles métier seront ajoutés progressivement dans des branches dédiées.

## Lancement du backend

En local :

```bash
npm run dev
```

Après build :

```bash
npm run build
npm run start
```

## Swagger

```txt
http://localhost:3000/api/v1/docs
```

## Health check

```txt
GET http://localhost:3000/api/v1/health
```

## Tests

```bash
npm run lint
npm run test
npm run build
```

## CI GitHub Actions

La CI se déclenche sur chaque push de branche et sur les Pull Requests ouvertes, mises à jour ou rouvertes.

Elle exécute un seul job qui vérifie :

1. `npm ci`
2. `npm run prisma:generate`
3. `npm run lint`
4. `npm run test`
5. `npm run build`

La CI ne déploie pas l'application et ne crée aucune ressource externe.
