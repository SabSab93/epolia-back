---
name: nestjs-crud-planner
description: Plan simple NestJS CRUD modules for Epolia. Use before adding controllers, services, DTOs, or Prisma-backed CRUD behavior.
---

# NestJS CRUD Planner

Use this skill to keep future CRUD implementations consistent and simple.

## Structure

Use this shape unless the existing module already has a clearer convention:

```txt
feature/
  feature.module.ts
  feature.controller.ts
  feature.service.ts
  dto/
  feature.service.spec.ts
```

## Rules

- Keep controllers focused on HTTP routing and request/response mapping.
- Keep application logic in services.
- Use Prisma from services only.
- Validate input with DTOs and `class-validator`.
- Use NestJS exceptions for error cases.
- Keep responses predictable and easy to test.
- Do not add generic repositories, CQRS, or event buses without a real issue requirement.

## Checklist

Before coding, confirm the entity, routes, DTOs, Prisma model status, authorization expectations, and tests required by the issue.
