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

- `NODE_ENV` : `development`, `test` ou `production`.
- `PORT` : port HTTP du backend, `3000` par défaut.
- `DATABASE_URL` et `DIRECT_URL` : connexions PostgreSQL utilisées par Prisma.
- `CORS_ORIGIN` : origines web autorisées, séparées par des virgules.
- `JWT_SECRET` : secret JWT, obligatoire et non générique en production.

En local, `CORS_ORIGIN` peut contenir les URLs du front web et du serveur de développement mobile, par exemple `http://localhost:3000,http://localhost:8081`. En production, `CORS_ORIGIN` doit être limité à des origines connues. Les applications mobiles natives ne sont pas bloquées par CORS de la même façon qu'un navigateur, mais leurs vues web éventuelles le sont.

Le fichier `.env` reste local et ne doit pas être commité.

## API

| Point d'entrée | URL locale                       |
| -------------- | -------------------------------- |
| Swagger        | http://localhost:3000/api/docs   |
| Health check   | http://localhost:3000/api/health |

Les routes utilisent le préfixe `/api`. L'authentification locale, les profils utilisateur et étudiant, et l'administration des utilisateurs sont implémentés.

Le schéma Prisma couvre le MLD final, y compris les domaines dont les routes restent à développer.

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

La CI se déclenche sur chaque push de branche et sur les Pull Requests ouvertes, mises à jour ou rouvertes.

Elle exécute un seul job qui vérifie :

1. `npm ci`
2. `npm run prisma:generate`
3. `npm run lint`
4. `npm run test`
5. `npm run build`

La CI ne déploie pas l'application et ne crée aucune ressource externe.
