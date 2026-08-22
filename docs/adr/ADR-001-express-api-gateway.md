# ADR-001 - Cible Express et API Gateway

## Statut

Accepte.

## Contexte

Le backend Epolia a ete initialise comme un monolithe modulaire NestJS avec TypeScript, Prisma, PostgreSQL, Swagger et Jest.

Ce choix a permis de poser rapidement un cadre professionnel :

- structure claire par modules ;
- injection de dependances ;
- validation et erreurs via les primitives NestJS ;
- documentation Swagger ;
- tests automatises ;
- CI GitHub Actions.

Avec l'avancement du projet, le retour d'experience montre aussi des limites pour une developpeuse seule dans un projet ecole :

- NestJS impose une courbe d'apprentissage importante ;
- certaines abstractions masquent le fonctionnement HTTP reel ;
- les decorators, modules et providers ajoutent du code technique avant meme la logique metier ;
- la migration future vers plusieurs applications serait plus lisible avec une structure Express explicite.

La rearchitecture doit rester progressive. Elle ne doit pas devenir une refonte globale ni changer le metier sans besoin.

## Decision

Epolia migrera progressivement du socle NestJS actuel vers Express + TypeScript, puis vers un nombre limite d'applications backend dans un monorepo unique.

La cible de travail est :

```txt
Clients Web / Mobile
        |
        v
API Gateway - Express + TypeScript
        |
        v
Identity/Auth | Marketplace/Core | Payment/Finance
                              |
                              v
Communication, seulement si justifie plus tard
```

La migration se fera par etapes :

1. formaliser l'ADR et la structure cible ;
2. initialiser le socle Express ;
3. migrer Prisma et Users vers Express ;
4. retirer NestJS apres validation de parite ;
5. preparer le monorepo multi-apps ;
6. introduire l'API Gateway ;
7. extraire Identity/Auth ;
8. adapter la CI aux applications concernees.

## Options comparees

### Maintenir NestJS

Avantages :

- cadre complet et standardise ;
- conventions solides pour les modules backend ;
- integration native avec Swagger, validation, guards et providers ;
- bon choix pour des equipes qui connaissent deja le framework.

Inconvenients :

- courbe d'apprentissage plus forte ;
- plus de concepts a expliquer et defendre ;
- structure parfois lourde pour un projet ecole ;
- extraction progressive vers plusieurs applications moins explicite pour ce contexte.

### Migrer vers Express + TypeScript

Avantages :

- fonctionnement HTTP plus direct ;
- structure plus explicite et plus simple a expliquer ;
- moins de magie framework ;
- migration progressive plus facile a documenter ;
- meilleur controle sur le decoupage routes, controllers, services, repositories.

Inconvenients :

- plus de conventions a definir soi-meme ;
- risque d'incoherence si la structure n'est pas respectee ;
- plus de responsabilite sur la gestion globale des erreurs, validation, middlewares et typage ;
- moins de garde-fous fournis par le framework.

## Convention commune

Chaque application Express doit suivre la meme organisation logique :

```txt
routes -> controllers -> services -> repositories
                         |
                         v
validators, errors, middlewares
```

Responsabilites :

- `routes` : declarent les endpoints et branchent les middlewares necessaires ;
- `controllers` : lisent la requete HTTP, appellent le service et formatent la reponse ;
- `services` : portent la logique applicative et les regles metier ;
- `repositories` : isolent l'acces aux donnees via Prisma ;
- `validators` : valident les entrees avant la logique metier ;
- `errors` : exposent des erreurs typees et previsibles ;
- `middlewares` : gerent les preoccupations transverses comme auth, logs, erreurs et securite HTTP.

La logique metier ne doit pas etre placee dans les routes, les controllers ou la Gateway.

## Monorepo

Le repository `epolia-back` reste un monorepo unique.

Ce choix permet de :

- garder une seule base de code backend ;
- partager les conventions TypeScript ;
- mutualiser Prisma et les types communs tant que c'est utile ;
- simplifier la CI ;
- eviter une multiplication prematuree des repositories.

## API Gateway

La Gateway sera introduite apres stabilisation du socle Express.

Ses responsabilites :

- etre le point d'entree des clients web et mobile ;
- router les requetes vers les applications internes ;
- appliquer les middlewares transverses d'entree ;
- centraliser certains aspects techniques : CORS, rate limiting, logs, correlation id ;
- exposer une surface HTTP coherent pour les clients.

Ce qu'elle ne doit pas faire :

- contenir la logique metier ;
- acceder directement a la base de donnees pour les domaines metier ;
- devenir un service central qui connait toutes les regles internes ;
- compenser un mauvais decoupage des services.

## Frontieres initiales

### Identity/Auth

Responsabilites :

- utilisateurs ;
- authentification ;
- sessions ou tokens ;
- roles ;
- droits d'acces ;
- securite des parcours d'identite.

### Marketplace/Core

Responsabilites :

- profils ;
- competences ;
- missions ;
- candidatures ou demandes ;
- avis ;
- logique principale de mise en relation.

### Payment/Finance

Responsabilites :

- paiements fictifs ou reels selon la phase du projet ;
- wallet ;
- transactions ;
- commissions ;
- integration future avec un prestataire de paiement si necessaire.

### Communication

Communication reste optionnel.

Ce domaine ne sera extrait que si un besoin technique le justifie clairement, par exemple messagerie temps reel, notifications complexes ou volumetrie separee.

### Admin

Admin n'est pas un microservice par defaut.

Admin est d'abord un role transverse et une surface d'administration au-dessus des domaines existants. Un service dedie ne sera envisage que si des besoins techniques ou organisationnels distincts apparaissent.

## Strategie de base de donnees

Pour la premiere version distribuee, Epolia conserve PostgreSQL et Prisma.

La strategie retenue est progressive :

- une base PostgreSQL unique au depart ;
- un schema Prisma commun tant que le decoupage applicatif n'est pas stabilise ;
- une responsabilite claire des tables par domaine ;
- pas d'acces direct d'un service aux tables d'un autre domaine sans justification ;
- pas de multiplication de bases de donnees en premiere intention.

Une separation physique des bases pourra etre etudiee plus tard si elle resout un probleme reel : isolation forte, scalabilite, securite, autonomie de deploiement ou contraintes d'exploitation.

## Decisions explicites

- Pas de microservice par ecran.
- Pas de microservice par type d'utilisateur.
- Pas de decoupage excessif.
- Pas de logique metier dans la Gateway.
- Migration progressive et reversible.
- Conservation de TypeScript, Prisma et PostgreSQL.
- Conservation d'un monorepo unique.
- Communication reste optionnel jusqu'a justification technique.
- Admin reste transverse par defaut.

## Consequences

Effets positifs :

- architecture plus explicite pour le jury ;
- code HTTP plus direct ;
- migration decomposable en petites issues ;
- separation progressive des responsabilites ;
- meilleure lisibilite du futur decoupage Gateway et services.

Risques :

- perte de certains garde-fous NestJS ;
- duplication possible si les conventions Express ne sont pas respectees ;
- besoin de documenter clairement les erreurs, middlewares et validations ;
- complexite supplementaire au moment de l'introduction de la Gateway.

Mesures de maitrise :

- migrer domaine par domaine ;
- garder les tests pendant toute la transition ;
- valider la parite fonctionnelle avant retrait de NestJS ;
- refuser les extractions de services sans justification ;
- documenter chaque decision structurante dans un ADR.

## Hors perimetre de cette decision

- modification du code applicatif ;
- suppression de NestJS ;
- creation de la Gateway ;
- deploiement ;
- implementation des services.
