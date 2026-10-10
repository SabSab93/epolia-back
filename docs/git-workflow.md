# Strategie Git - Epolia Backend

Ce document décrit le workflow Git recommandé pour garder un historique lisible sans ajouter de blocages inutiles.

## Regles a conserver

- `main` reste la branche principale.
- `main` doit etre protegee.
- Les changements passent par une Pull Request avant merge.
- La CI doit passer sur la Pull Request avant merge.
- Aucun secret ne doit etre commite.

## Workflow recommande

```bash
git checkout main
git pull origin main
git checkout -b type/issue-number-short-description
```

Exemple :

```bash
git checkout -b feat/23-migrate-users-express
```

Le lien issue -> branche -> Pull Request reste recommande quand une issue existe.

## Branches

Format recommande :

```txt
type/issue-number-short-description
```

Types courants :

```txt
feat
fix
chore
docs
test
refactor
ci
build
style
perf
hotfix
```

Ce format aide a retrouver l'issue et le contexte. Il reste une recommandation, pas une validation bloquante.

Le hook Git local affiche un avertissement si le nom de branche ne suit pas ce format. Il ne bloque pas les pushes.

## Commits

Conventional Commits reste recommande :

```txt
type(scope): message court
```

Exemples :

```txt
docs(github): simplify issue templates
ci(github): keep quality checks only
feat(users): add user endpoint
```

Commitlint est garde comme aide locale Husky. Il affiche un avertissement mais ne bloque plus le commit.

## Pull Requests

Une Pull Request doit rester courte et lisible.

Contenu attendu :

- objectif ;
- issue liee si elle existe, par exemple `Closes #6` ;
- changements realises ;
- validations lancees.

Le titre de PR doit etre clair. Il peut reprendre le titre de l'issue ou utiliser Conventional Commits.

## CI

La CI est lancee sur les Pull Requests et sur chaque push de branche.
Elle conserve un seul job avec les controles essentiels :

- installation des dependances avec `npm ci` ;
- generation du client Prisma avec `npm run prisma:generate` ;
- `npm run lint` ;
- `npm run test` ;
- `npm run build`.

Avant d'ouvrir une PR, il reste recommande de lancer localement :

```bash
npm run lint
npm run test
npm run build
```

## Protection de main

La branche `main` doit etre protegee avec :

- Pull Request obligatoire avant merge ;
- blocage des force push ;
- blocage de la suppression ;
- check `Install, lint, test and build` obligatoire avant merge.

## Regle generale

Le workflow attendu reste simple :

```txt
issue claire si necessaire
branche dediee
PR courte
CI verte
merge vers main
```
