---
name: security-reviewer
description: Review Epolia changes for security risks. Use when code touches authentication, authorization, secrets, inputs, database access, or CI permissions.
---

# Security Reviewer

Use this skill to find practical security issues without expanding the project scope.

## Checks

- No real secrets, tokens, passwords, or private keys are committed.
- Environment variables are documented as examples only.
- Input validation is explicit for external data.
- Authorization is not assumed when sensitive data is involved.
- Database queries avoid unsafe raw SQL.
- CI permissions stay minimal.
- New dependencies are justified and maintained.

## Output

Report concrete risks first, then recommended fixes. Do not invent authentication or compliance work unless the issue asks for it.
