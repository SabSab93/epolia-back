# ADR-001 - Cible Express et API Gateway

## Statut

Accepte. Le socle Express autonome est devenu l'architecture active du repository pendant l'issue #24.

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
- une structure Express explicite rend plus lisibles les flux HTTP, les middlewares, les erreurs et les responsabilites des couches.

NestJS permet tout a fait de construire des architectures distribuees. Le choix d'Express ne decoule donc pas d'une incapacite de NestJS a gerer plusieurs services, mais d'une volonte de reduire le niveau d'abstraction et de rendre les responsabilites plus explicites dans le contexte specifique d'Epolia.

Cette reevaluation intervient aussi pendant la montee en competence sur React Native pour le client mobile. Reduire la courbe d'apprentissage cote backend permet de concentrer l'effort de veille sur le front tout en conservant une maitrise approfondie du serveur. Ce critere complete les arguments d'architecture, sans les remplacer.

La rearchitecture doit rester progressive. Elle ne doit pas devenir une refonte globale ni changer le metier sans besoin.

## Decision

Epolia migre progressivement du socle NestJS initial vers Express + TypeScript, puis vers un nombre limite d'applications backend dans un monorepo unique.

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

La migration se fait par etapes :

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
- flux HTTP, middlewares et gestion d'erreurs moins visibles dans ce contexte d'apprentissage.

### Migrer vers Express + TypeScript

Avantages :

- fonctionnement HTTP plus direct ;
- structure plus explicite et plus simple a expliquer ;
- moins de magie framework ;
- migration progressive plus facile a documenter ;
- meilleur controle sur le decoupage, sans imposer de couches avant besoin reel.

Inconvenients :

- plus de conventions a definir soi-meme ;
- risque d'incoherence si la structure n'est pas respectee ;
- plus de responsabilite sur la gestion globale des erreurs, validation, middlewares et typage ;
- moins de garde-fous fournis par le framework.

## Convention commune

Le socle Express doit rester volontairement simple.

Pour la phase actuelle, le flux privilegie est :

```txt
routes -> Prisma
```

Responsabilites actuelles :

- `routes` : declarent les endpoints, lisent la requete HTTP, appellent Prisma et formatent la reponse ;
- `errors` : exposent des erreurs typees et previsibles ;
- `middlewares` : gerent les preoccupations transverses comme erreurs, securite HTTP et parsing des requetes.

Des couches supplementaires pourront etre ajoutees progressivement si elles repondent a un besoin concret :

```txt
routes -> services -> Prisma
routes -> services -> repositories -> Prisma
```

Ce choix evite d'introduire prematurement des controllers, DTO, schemas ou repositories dont le seul role serait d'encapsuler une ligne Prisma.

La logique metier ne doit pas etre placee dans la Gateway.

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

- profils etudiant et particulier ;
- competences ;
- etudes ;
- portfolio ;
- disponibilites ;
- favoris ;
- recherche et geolocalisation ;
- mise en relation ;
- conversations liees au parcours metier tant que Communication n'est pas extrait ;
- missions ;
- avis ;
- signalements metier.

### Payment/Finance

Responsabilites :

- integration Mangopay ;
- paiements des missions ;
- sequestre des fonds pendant la mission ;
- wallets utilisateurs ;
- transactions ;
- commissions Epolia ;
- retraits vers compte bancaire ;
- traitement des webhooks Mangopay ;
- donnees financieres necessaires a la conformite DAC7.

### Communication

Communication reste optionnel.

Ce domaine ne sera extrait que si un besoin technique le justifie clairement, par exemple messagerie temps reel, notifications complexes ou volumetrie separee.

Tant que la messagerie ne necessite pas un cycle de deploiement, une infrastructure temps reel ou une montee en charge distincte, elle reste integree au Marketplace/Core afin d'eviter une communication inter-services inutile.

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

Le partage d'une base de donnees ne signifie pas que tous les services sont autorises a manipuler toutes les tables. Chaque domaine reste proprietaire de ses donnees et les acces croises doivent etre evites.

Une separation physique des bases pourra etre etudiee plus tard si elle resout un probleme reel : isolation forte, scalabilite, securite, autonomie de deploiement ou contraintes d'exploitation.

Cette approche dissocie volontairement l'independance applicative de l'independance physique des donnees. Dans cette premiere etape, l'isolation est logique. Une separation physique prematuree imposerait de gerer de la coherence distribuee sans besoin produit reel.

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
