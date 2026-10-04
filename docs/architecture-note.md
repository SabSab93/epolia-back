# Note d'architecture - Backend Epolia

Le backend Epolia utilise maintenant un socle Express + TypeScript autonome.

L'objectif reste de garder une fondation technique propre et simple :

- configuration Express ;
- Swagger ;
- sécurité HTTP de base ;
- Prisma aligné sur le MLD final ;
- PostgreSQL local via Docker ;
- CI GitHub Actions ;
- Jest conservé.

La première migration active représente désormais le MLD final validé :
users / auth, profils, catalogue étudiant, favoris, messagerie, missions, paiements, wallet, retraits, avis, signalements, vérifications, RGPD, DAC7, notifications et audit admin.

Les CRUD métier seront ajoutés progressivement au-dessus de ce socle, sans réintroduire de modèles obsolètes comme `CustomerProfile`.
