# Strategie Git - Epolia Backend

Ce document décrit le workflow Git recommandé pour garder un historique lisible sans ajouter de blocages inutiles.

## Regles a conserver

- `main` reste la branche principale.
- `main` doit etre protegee.
- Les changements passent par une Pull Request avant merge.
- Les validations sont lancees localement avant la Pull Request.
- Aucun secret ne doit etre commite.

## Workflow recommande

```bash
git checkout main
git pull origin main
git checkout -b type/issue-number-short-description
```

Exemple :

```bash
git checkout -b feat/6-simplify-github-ai-workflow
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

La verification locale existe encore comme aide :

```bash
npm run branch:check
```

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

Le script local peut aider a creer une PR :

```bash
npm run pr:create
```

Il tente de detecter un numero d'issue dans le nom de branche et de reprendre le titre GitHub si disponible.

## CI

La CI est lancee sur `main` apres merge et conserve les controles essentiels :

- generation Prisma si `prisma/schema.prisma` existe ;
- `npm run lint` ;
- `npm run test` ;
- `npm run build`.

Elle n'est pas lancee automatiquement sur les Pull Requests.
Avant d'ouvrir ou de merger une PR, lancer localement :

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
- pas de CI obligatoire sur Pull Request.

## Regle generale

Le workflow attendu reste simple :

```txt
issue claire si necessaire
branche dediee
PR courte
validations locales
merge vers main
```
