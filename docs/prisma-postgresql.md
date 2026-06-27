# PostgreSQL et Prisma

Cette page vérifie la base PostgreSQL locale / Supabase et les commandes Prisma utiles avant la création des modèles métier.

## Variables d'environnement

Créer un fichier local :

```bash
cp .env.example .env
```

Variables attendues :

```txt
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/epolia?schema=public"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5433/epolia?schema=public"
```

Pour Supabase :

- `DATABASE_URL` peut utiliser l'URL poolée ;
- `DIRECT_URL` doit utiliser l'URL directe, notamment pour les migrations Prisma.

Ne jamais committer de vraie valeur `.env`.

## PostgreSQL local

Vérifier que Docker Desktop est démarré.

Démarrer la base locale :

```bash
docker compose up -d postgres
```

Vérifier le conteneur :

```bash
docker compose ps
```

Le port hôte utilisé est `5433` pour éviter les conflits avec un PostgreSQL local déjà installé sur `5432`.

Arrêter la base locale :

```bash
docker compose down
```

Supprimer aussi le volume local si nécessaire :

```bash
docker compose down -v
```

## Prisma

Le schéma Prisma utilise PostgreSQL :

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Générer Prisma Client :

```bash
npm run prisma:generate
```

Formater le schéma Prisma :

```bash
npm run prisma:format
```

Créer une migration en développement :

```bash
npm run prisma:migrate:dev
```

Pousser le schéma sans migration :

```bash
npm run db:push
```

Ouvrir Prisma Studio :

```bash
npm run prisma:studio
```

## Test de connexion

Après démarrage de PostgreSQL local, tester la connexion avec Prisma :

```bash
printf 'SELECT 1;' | npx prisma db execute --schema prisma/schema.prisma --stdin
```

Ce test ne crée aucun modèle métier et ne modifie pas le schéma.

Si Prisma retourne `P1001`, la base PostgreSQL n'est pas joignable. Vérifier que Docker Desktop est lancé puis relancer `docker compose up -d postgres`.
