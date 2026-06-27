# Workflow IA - Epolia Backend

Cette documentation cadre l'usage de l'IA pour aider le développement backend sans alourdir le projet.

## Stack IA

Le projet privilégie une stack IA sobre :

```txt
ChatGPT + Codex + AGENTS.md + skills projet + Serena + Caveman
```

## Outils

- **ChatGPT** : architecture, clarification d'issue, arbitrages, revue générale.
- **Codex** : modifications dans le repository, tests, petites automatisations.
- **GitHub CLI** : issues, Pull Requests, checks et workflow Git.
- **Serena MCP** : navigation symbolique quand le code grossit.
- **Caveman** : réponses plus courtes quand le contexte est déjà clair.

## Quand utiliser ChatGPT

- Clarifier une fonctionnalité avant codage.
- Comparer deux approches.
- Préparer une issue ou une review.
- Demander une explication pédagogique.

## Quand utiliser Codex

- Modifier le code ou la documentation.
- Lire le repository.
- Lancer `npm run lint`, `npm run test`, `npm run build`.
- Préparer une Pull Request.

## Mode Plan

Utiliser le mode Plan quand :

- le périmètre est ambigu ;
- plusieurs fichiers ou modules sont concernés ;
- une décision d'architecture est nécessaire.

Éviter le mode Plan pour une correction simple et évidente.

## Réduire les tokens

- Donner le lien ou le texte complet de l'issue.
- Demander une réponse courte.
- Demander une review ciblée.
- Éviter de redemander le contexte déjà documenté dans `AGENTS.md`.
- Utiliser Serena pour retrouver les symboles au lieu de charger trop de fichiers.

## Serena MCP

Serena est utilisé pour aider les agents IA à naviguer dans le code au niveau des symboles.

Installation locale :

```bash
uv tool install -p 3.13 serena-agent
serena init
```

Usage recommandé :

- comprendre un module existant ;
- retrouver les classes, services, DTO ;
- analyser les dépendances ;
- préparer un refactor ;
- éviter de charger trop de fichiers dans le contexte IA.

Serena ne doit pas modifier le code sans validation explicite.

Serena est un outil local développeuse. Il ne doit pas être ajouté comme dépendance npm du backend.

## Caveman

Caveman sert à réduire la verbosité des agents IA.

Installation :

```bash
npx skills add JuliusBrussee/caveman
```

Option CLI globale :

```bash
npm i -g @juliusbrussee/caveman-code
```

Usage recommandé :

- réponses très courtes ;
- plans courts ;
- reviews courtes ;
- résumés rapides ;
- éviter les longues explications répétitives.

Caveman ne doit pas remplacer les instructions projet.
Il doit être utilisé comme option de compression, pas comme architecture de travail.

Ne pas utiliser Caveman quand une explication pédagogique détaillée est nécessaire.

## Review IA

Pour demander une review IA :

1. ouvrir une Pull Request courte ;
2. vérifier que la CI passe ;
3. lancer le workflow manuel `AI review` si souhaité ;
4. si Copilot Code Review n'est pas disponible, demander une review manuelle à ChatGPT ou Codex avec le diff.

La review IA ne remplace pas la décision humaine.

## Workflow propre

1. Lire l'issue et confirmer le périmètre.
2. Créer une branche dédiée.
3. Faire des modifications courtes et ciblées.
4. Lancer les validations locales.
5. Ouvrir une Pull Request avec le titre de l'issue.
6. Demander une review humaine, et une review IA manuelle si utile.

## Outils non installés pour le moment

Les outils suivants sont identifiés mais non installés afin d'éviter une stack IA trop lourde :

- BMAD Method ;
- Aider ;
- GitHub MCP avec permissions larges ;
- Context7 MCP ;
- Cline ;
- Roo Code ;
- workflows IA payants automatiques.

Ils pourront être évalués plus tard si un vrai besoin apparaît.

## Règle générale

L'IA aide à produire des changements plus propres, mais ne doit pas ajouter de code métier, de secret, de dépendance ou d'automatisation hors périmètre.
