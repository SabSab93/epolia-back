---
name: pr-reviewer
description: Review an Epolia pull request for scope, regressions, tests, and maintainability. Use before merging or requesting human review.
---

# PR Reviewer

Use this skill for a senior review of a PR diff.

## Priorities

1. Bugs and behavioral regressions.
2. Security or secret exposure.
3. Scope creep against the issue.
4. Missing tests or broken validation.
5. Readability and maintainability.

## Rules

- Start with findings.
- Include file and line when possible.
- Keep summaries secondary.
- Say clearly when no issue is found.
- Do not request broad refactors unless needed for the issue.

## Validation

Check whether `npm run lint`, `npm run test`, and `npm run build` were run or explain why not.
