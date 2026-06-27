# Backend instructions

- Garder un monolithe modulaire NestJS.
- Un module doit rester lisible : module, controller, service, DTO, tests si nécessaire.
- Ne pas ajouter de microservices, CQRS ou repository générique sans demande explicite.
- Prisma reste dans les services, pas dans les controllers.
