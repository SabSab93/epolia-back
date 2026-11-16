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
- `REGISTRATION_TERMS_VERSION` : version exacte des CGU présentées à l’inscription. Tant qu’aucune version n’est configurée, la création de compte renvoie `503 REGISTRATION_TERMS_UNAVAILABLE`.

Pour tester l’inscription, configurer une version de test dans l’API et envoyer cette même version depuis l’interface avec le document provisoire « CGU à compléter ».

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

## Confirmation de l'adresse e-mail

Décisions de l'issue #76 :

- **Envoi** : [Resend](https://resend.com), avec `RESEND_API_KEY` et `EMAIL_FROM` (adresse d'un domaine vérifié chez Resend). Sans ces variables, aucun e-mail n'est envoyé et l'API le signale (`EMAIL_SERVICE_UNAVAILABLE`). Une réponse positive veut dire que Resend a accepté le message, pas qu'il est arrivé.
- **Lien** : `PUBLIC_API_URL/api/auth/verify-email?token=…`. Il ouvre une page servie par l'API avec un bouton « Confirmer », valable sur navigateur, Android et iOS sans configuration de lien vers l'application. Ouvrir le lien ne confirme rien : les antivirus de messagerie qui ouvrent les liens ne peuvent donc pas le consommer. Si `APP_RETURN_URL` est renseignée (par exemple `epolia://email-verified`), la page affiche un bouton « Ouvrir l'application Epolia » ; il ne fonctionne que si l'application déclare cette adresse (schéma d'URL Capacitor, côté front). L'application relit ensuite `GET /api/auth/me` (`emailVerified`).
- **Jeton** : 32 octets aléatoires, valable 24 h, utilisable une fois. Seule son empreinte SHA-256 est stockée (`email_verification_tokens`). Un nouvel envoi rend les liens précédents expirés. Le lien ne confirme que l'adresse à laquelle il a été envoyé.
- **Inscription** : le compte est créé même si l'envoi échoue ; la réponse contient `emailVerificationSent: false` et l'application propose le renvoi (`POST /api/auth/email-verification`).
- **Limites** : un envoi par minute et cinq par 24 h par compte, comptés en base.
- **Avant confirmation** : la connexion et la création du profil restent possibles. Les futures routes de contact, de mission, de paiement et de publication du profil devront exiger `emailVerified` (disponible dans `response.locals.authUser`).
- **Comptes existants** : non confirmés ; ils peuvent demander un lien.
- Adresse confirmée, compte actif (`status`) et étudiant approuvé (`StudentVerification`) restent trois états distincts.

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
