# Epolia Backend

Backend de la marketplace Epolia.

Epolia est une application fictive de fin de master permettant de mettre en relation des particuliers et des étudiants pour des services de proximité.

## Stack

- Node.js
- TypeScript
- NestJS
- PostgreSQL
- Prisma
- Swagger / OpenAPI
- Jest

## Architecture cible

Le backend démarre sous forme de monolithe modulaire.

Ce choix permet :
- d'éviter des microservices prématurés ;
- de garder un backend maintenable ;
- d'ajouter les modules métier progressivement ;
- de préparer une évolution future si le projet grandit.

## Installation

```bash
npm install
```

## Configuration

```bash
cp .env.example .env
```

## Base PostgreSQL locale

```bash
docker compose up -d
```

## Prisma

```bash
npm run prisma:generate
npm run prisma:format
```

Voir aussi [docs/prisma-postgresql.md](docs/prisma-postgresql.md) pour les commandes PostgreSQL, Prisma et le test de connexion.

Les modèles métier seront ajoutés progressivement dans des branches dédiées.

## Lancement

```bash
npm run start:dev
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
npm run test
```
