# Workflow IA - Epolia Backend

L'IA est une assistance manuelle pour clarifier, coder, tester et relire. Elle ne doit pas bloquer un merge ni ajouter de gouvernance inutile.

## Outils utiles

- **ChatGPT** : clarification d'issue, arbitrage, explication, preparation de review.
- **Codex** : modifications dans le repository, tests locaux, documentation, petites automatisations.
- **GitHub CLI** : creation d'issues, Pull Requests et consultation des checks.
- **Skills projet** : procedures courtes pour les taches repetitives.

## Creation d'issue

Utiliser le skill projet :

```txt
issue-creator
```

Il aide a transformer une idee en issue courte avec :

- objectif ;
- taches a faire ;
- validation ;
- hors perimetre si utile.

Les templates GitHub restent simples et les issues vides sont autorisees pour ne pas bloquer la prise de notes rapide.

## Utilisation de Codex

Demander a Codex de :

- lire l'issue ou le contexte fourni ;
- confirmer le perimetre ;
- faire un plan court si plusieurs fichiers sont touches ;
- modifier uniquement les fichiers necessaires ;
- lancer `npm run lint`, `npm run test` et `npm run build`.

## Review IA

Le workflow GitHub `AI review` reste manuel :

```txt
Actions -> AI review -> Run workflow
```

Il n'est pas appele automatiquement et ne doit pas etre requis dans la protection de branche.

Si Copilot Code Review n'est pas disponible, demander une review manuelle a ChatGPT ou Codex avec le diff.

La review IA aide a detecter les risques, mais la decision de merge reste humaine.

## Regles simples

- Ne pas ajouter de secret.
- Ne pas ajouter de dependance sans justification.
- Ne pas creer de code metier hors issue.
- Ne pas lancer de refactor global non demande.
- Respecter l'architecture existante sauf issue de migration explicite.
