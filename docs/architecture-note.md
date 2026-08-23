# Note d'architecture - Initialisation Epolia Backend

Le backend Epolia utilise maintenant un socle Express + TypeScript autonome.

À cette étape, l'objectif est de garder une fondation technique propre et simple :

- configuration Express ;
- Swagger ;
- sécurité HTTP de base ;
- Prisma initialisé ;
- PostgreSQL local via Docker ;
- CI GitHub Actions ;
- Jest conservé.

La première migration métier concerne le domaine Users avec Prisma.

Les autres domaines seront ajoutés progressivement dans des branches dédiées :

1. users / auth ;
2. profils ;
3. compétences / portfolio / disponibilités ;
4. missions ;
5. paiements Mangopay / wallet ;
6. messagerie ;
7. avis / signalements ;
8. admin / RGPD / DAC7.

Ce choix évite un gros commit initial illisible et permet de construire le backend proprement, modèle par modèle.
