# Stratégie Git - Epolia Backend

Ce document définit les règles Git utilisées pour le backend Epolia.

L’objectif est de garder un historique propre, lisible et professionnel.

---

## Branche principale

La branche principale du projet est :

```txt
main
```

La branche `main` est protégée.

Aucun développement ne doit être fait directement sur `main`.

Toutes les évolutions passent par :

```txt
1 issue GitHub
1 branche dédiée
1 Pull Request
1 merge vers main
```

---

## Workflow de développement

Pour chaque nouvelle tâche :

```bash
git checkout main
git pull origin main
git checkout -b type/numero-issue-description-courte
```

Exemple :

```bash
git checkout -b chore/2-github-templates-conventions
```

Une fois le développement terminé :

```bash
npm run lint
npm run test
npm run build
```

Puis :

```bash
git add .
git commit -m "type(scope): description courte"
git push -u origin nom-de-la-branche
```

La branche est ensuite fusionnée dans `main` via une Pull Request.

Le script local peut créer une Pull Request à partir de la branche courante :

```bash
npm run pr:create
```

Il récupère le titre de l'issue GitHub liée au numéro de branche et l'utilise comme titre par défaut de la Pull Request. Si le titre de l'issue n'est pas accessible, un titre Conventional Commits est généré depuis le nom de branche.

---

## Convention de branches

Format obligatoire :

```txt
type/numero-issue-description-courte
```

Exemples :

```txt
chore/2-github-templates-conventions
ci/3-update-github-actions
feat/5-user-model
feat/6-user-crud
test/7-user-tests
fix/12-auth-refresh-token
docs/15-architecture-note
```

Types autorisés :

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

Règles :

- tout en minuscules ;
- pas d’accents ;
- pas d’espaces ;
- mots séparés par des tirets ;
- numéro d’issue obligatoire ;
- la branche doit être liée à une issue GitHub.

---

## Convention de commits

Le projet utilise la convention **Conventional Commits**.

Format obligatoire :

```txt
type: message court
type(scope): message court
```

Le scope est recommandé pour préciser la zone concernée, mais il reste optionnel si le changement est transversal :

Exemples :

```txt
chore(github): add issue templates
ci(github): validate branch names
feat(users): create user model
feat(auth): add login endpoint
fix(auth): handle invalid refresh token
test(users): add user service tests
docs(database): document mld choices
refactor(payments): simplify payment status handling
```

---

## Types de commits

| Type | Usage |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `chore` | Tâche technique sans impact métier |
| `docs` | Documentation |
| `test` | Ajout ou modification de tests |
| `refactor` | Refactorisation sans changement fonctionnel |
| `ci` | Intégration continue / GitHub Actions |
| `build` | Build, dépendances, packaging |
| `style` | Formatage uniquement |
| `perf` | Optimisation de performance |
| `hotfix` | Correction urgente |

---

## Scopes recommandés

Les scopes permettent d’indiquer la zone concernée.

Exemples de scopes utilisés dans Epolia :

```txt
github
ci
docs
config
database
prisma
users
auth
profiles
missions
payments
messaging
reviews
admin
compliance
tests
```

Exemples :

```txt
feat(users): create user model
feat(auth): add login endpoint
docs(database): explain mld choices
ci(github): update workflow checks
```

---

## Pull Requests

Chaque Pull Request doit :

- être liée à une issue GitHub ;
- contenir idéalement `Closes #numero` dans sa description ;
- reprendre le titre de l'issue GitHub quand il utilise un domaine entre crochets ;
- sinon avoir un titre au format Conventional Commits ;
- rester limitée au périmètre de l’issue ;
- contenir une description claire ;
- préciser les tests réalisés ;
- passer la CI avant merge.

Format recommandé du titre de PR :

```txt
[Domaine] Titre de l'issue
type(scope): description courte
```

Les formats `[Authentification] Titre de l'issue`, `[Paiement] Titre de l'issue`, `[Bug] Titre de l'issue` et `type: description courte` sont aussi acceptés.

Exemple :

```txt
chore(github): add templates and git conventions
[Authentification] Connexion utilisateur
[Bug] Erreur lors du paiement
```

---

## Protection de `main`

La branche `main` doit être protégée avec les règles suivantes :

- blocage des force push ;
- blocage de la suppression ;
- Pull Request obligatoire avant merge ;
- CI obligatoire avant merge.

Les checks attendus sont :

```txt
Validate Git conventions
Build and test
```

---

## CI obligatoire

Avant merge, la CI doit vérifier :

- le nom de la branche ;
- le titre de la Pull Request ;
- le numéro d'issue extrait de la branche, avec recommandation `Closes #numero` dans la description ;
- les messages de commit ;
- le lint ;
- les tests ;
- le build ;
- la génération Prisma si un schéma Prisma existe.

Commandes principales :

```bash
npm run lint
npm run test
npm run build
```

---

## Vérifications locales Husky

Husky exécute des contrôles locaux avant certaines actions Git :

- `.husky/commit-msg` vérifie le message de commit avec Commitlint ;
- `.husky/pre-push` vérifie le nom de la branche avant push.

La vérification de branche peut aussi être lancée manuellement :

```bash
npm run branch:check
```

Ces contrôles ne remplacent pas la CI, mais permettent de détecter les erreurs avant la Pull Request.

---

## Règle d’or

Une Pull Request doit être petite, lisible et liée à une issue.

Le workflow attendu est :

```txt
une issue claire
une branche dédiée
une PR courte
une CI verte
un merge vers main
```
