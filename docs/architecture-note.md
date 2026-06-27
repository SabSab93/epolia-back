# Note d'architecture - Initialisation Epolia Backend

Le backend Epolia est initialisé comme un monolithe modulaire NestJS.

À cette étape, l'objectif est uniquement de poser une fondation technique propre :

- configuration NestJS ;
- Swagger ;
- validation globale ;
- sécurité HTTP de base ;
- rate limiting ;
- Prisma initialisé ;
- PostgreSQL local via Docker ;
- CI GitHub Actions ;
- Jest conservé.

Les modèles métier ne sont pas encore créés.

Ils seront ajoutés progressivement dans des branches dédiées :

1. users / auth ;
2. profils ;
3. compétences / portfolio / disponibilités ;
4. missions ;
5. paiements fictifs / wallet ;
6. messagerie ;
7. avis / signalements ;
8. admin / RGPD / DAC7.

Ce choix évite un gros commit initial illisible et permet de construire le backend proprement, modèle par modèle.
