# AGENTS.md - Epolia Backend

## Projet

Epolia est une marketplace fictive de fin de master entre particuliers et étudiants pour des services de proximité.

## Architecture

Le backend est un monolithe modulaire NestJS.

- Ne pas créer de microservices.
- Ne pas ajouter de complexité inutile.
- Ne pas développer hors périmètre de l'issue.

## Stack

- Node.js 20+
- TypeScript
- NestJS
- PostgreSQL
- Prisma
- Swagger / OpenAPI
- Jest

## Réponses IA

- Répondre court, concret et actionnable.
- Éviter le blabla et les longues explications répétitives.
- Faire un plan court avant une modification significative.
- Signaler clairement les hypothèses, blocages et validations.

## Règles de modification

- Lire l'issue avant de modifier.
- Modifier uniquement les fichiers nécessaires.
- Ne pas ajouter de dépendance sans justification.
- Ne jamais ajouter de secret réel.
- Ne pas faire de refactor global non demandé.
- Ne pas créer de code métier non demandé.
- Préserver les changements existants de l'utilisateur.

## Style backend

Le code doit rester simple, lisible et maintenable.

- Privilégier du code prévisible.
- Éviter les abstractions inutiles.
- Éviter CQRS, event sourcing ou patterns complexes sans besoin réel.
- Garder les CRUD homogènes d'un module à l'autre.
- Ne pas mélanger plusieurs domaines métier dans une même issue.

Pour les futurs CRUD NestJS :

```txt
module/
  module.ts
  controller.ts
  service.ts
  dto/
  tests si nécessaire
```

Règles CRUD :

- le controller gère les routes HTTP ;
- le service contient la logique applicative simple ;
- Prisma est utilisé dans le service, pas dans le controller ;
- les DTO utilisent `class-validator` ;
- les erreurs utilisent les exceptions NestJS ;
- les réponses restent simples ;
- chaque route doit être facile à lire.

## Validation

Après modification :

```bash
npm run lint
npm run test
npm run build
```

## Git

Une tâche suit :

```txt
1 issue = 1 branche = 1 Pull Request
```

Branches :

```txt
type/issue-number-short-english-description
```

La description de branche doit être un slug anglais, en minuscules, sans accents ni espaces.

Commits :

```txt
type(scope): message court
```

Les Pull Requests doivent rester limitées au périmètre de l'issue.
