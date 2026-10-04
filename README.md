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
npm run prisma:migrate
```

Voir aussi [docs/prisma-postgresql.md](docs/prisma-postgresql.md) pour les commandes PostgreSQL, Prisma et le test de connexion.

Le schéma Prisma représente le MLD final validé : identité, profils, catalogue étudiant, missions, paiements, messagerie, avis, conformité RGPD/DAC7 et notifications.

## Lancement

En développement :

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
npm run test
```

Vérifications utiles avant une PR :

```bash
npm run lint
npm run build
```
