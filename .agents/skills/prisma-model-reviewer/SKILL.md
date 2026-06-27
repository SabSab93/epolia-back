---
name: prisma-model-reviewer
description: Review Prisma schema changes for Epolia. Use when a PR adds or modifies Prisma models, relations, enums, indexes, or migrations.
---

# Prisma Model Reviewer

Use this skill to review Prisma changes before accepting a data model.

## Checks

- Verify the model is requested by the issue.
- Check required vs optional fields.
- Check `@unique`, indexes, enums, and relation names.
- Confirm cascade behavior is intentional.
- Confirm migrations do not include unrelated changes.
- Look for secrets, seed data, or business data that should not be committed.

## Output

Report only concrete risks, missing constraints, unrelated changes, and validation commands.
