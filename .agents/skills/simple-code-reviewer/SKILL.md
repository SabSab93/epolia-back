---
name: simple-code-reviewer
description: Review Epolia code for simplicity and consistency. Use when a change works but may be too complex, inconsistent, or hard to maintain.
---

# Simple Code Reviewer

Use this skill to keep the backend straightforward.

## Checks

- Is the code easy to read without extra explanation?
- Is there an unnecessary abstraction?
- Does it follow existing NestJS and Prisma patterns?
- Are names clear and consistent?
- Is the change limited to the issue?
- Can validation or error handling be simpler?

## Output

Give short, actionable comments. Prefer removing complexity over adding new patterns.
