---
name: issue-creator
description: Create concise GitHub issues for Epolia from a rough idea, bug report, TODO, or planning note. Use when the user wants to create, draft, simplify, split, or prepare an issue before opening it on GitHub.
---

# Issue Creator

Use this skill to turn a rough request into a short, actionable GitHub issue.

## Workflow

1. Identify the issue type: backend task, bug, docs, config, or maintenance.
2. Keep the issue small enough for one branch and one Pull Request.
3. Separate what must be done from what is only context.
4. Add a short out-of-scope section only when it prevents confusion.
5. Add validation steps that match the change.

## Output Format

```md
## Objectif

...

## A faire

- ...

## Validation

- npm run lint
- npm run test
- npm run build

## Hors perimetre

- ...
```

## Rules

- Prefer French for issue content.
- Keep titles clear and human-readable.
- Do not force a long template when the request is simple.
- Do not invent business behavior not provided by the user.
- Mention dependencies only when another issue or decision blocks the work.
- Suggest a branch name only if useful, using `type/issue-number-short-description` when an issue number exists.
