# SESSION 3 — Offline-First & Sync Core

## 1. Objectif de la session

Construire le socle technique de synchronisation de l'application scolaire Windows afin de permettre :

- un fonctionnement autonome hors connexion ;
- l'utilisation de SQLite comme base opérationnelle locale ;
- la synchronisation avec Supabase lorsque la connexion est disponible ;
- la synchronisation entre plusieurs appareils d'un même établissement ;
- la détection et la gestion des conflits ;
- la reprise d'une synchronisation interrompue ;
- une synchronisation manuelle via un bouton visible dans l'application.

> Principe fondamental : SQLite est la base opérationnelle locale. Supabase est la base centrale de synchronisation.

---

## 2. Architecture cible

```text
┌──────────────────────────────┐
│       React + TypeScript     │
│          Interface           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Tauri Commands         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│          Rust Core            │
│      Sync Engine / RBAC       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│           SQLite              │
│                              │
│  Données métier              │
│  Outbox                      │
│  Inbox                       │
│  Sync State                  │
└──────────────┬───────────────┘
               │
               │ Synchronisation
               ▼
┌──────────────────────────────┐
│          Supabase             │
│ PostgreSQL / Auth / RLS      │
└──────────────────────────────┘
```

---

# 3. Règles que l'IA doit impérativement respecter

1. Ne jamais supprimer une décision déjà validée sans demander une nouvelle validation.
2. Ne jamais remplacer SQLite par Supabase comme base opérationnelle locale.
3. L'application doit rester utilisable sans Internet après activation/configuration autorisée.
4. Toute donnée synchronisable doit posséder un UUID stable.
5. Les données appartenant à un établissement doivent être isolées par `school_id`.
6. Les données annuelles doivent respecter `academic_year_id` lorsque cela est applicable.
7. Ne jamais utiliser un simple auto-incrément local comme identifiant métier synchronisable.
8. Les suppressions synchronisables doivent utiliser le soft delete lorsque le modèle le prévoit.
9. Une modification locale doit être enregistrée de manière fiable avant d'être considérée comme synchronisable.
10. Une synchronisation interrompue ne doit pas perdre les mutations déjà enregistrées.
11. Le moteur doit pouvoir reprendre une synchronisation sans créer de doublons.
12. Une erreur réseau ne doit pas supprimer une mutation locale en attente.
13. Les conflits critiques ne doivent jamais être écrasés silencieusement.
14. Les notes, résultats, paiements, présences et autres données sensibles doivent disposer de règles de conflit explicites.
15. Les permissions doivent être contrôlées dans le cœur de l'application, pas uniquement dans l'interface.
16. Supabase RLS doit assurer l'isolation entre établissements.
17. Les secrets et informations sensibles ne doivent pas être stockés en clair dans `localStorage` ou dans des fichiers texte non protégés.
18. Chaque étape de développement doit être testée avant de passer à la suivante.
19. Toute modification du schéma SQLite ou Supabase doit passer par une migration versionnée.
20. L'IA doit signaler immédiatement toute contradiction ou risque technique détecté.

---

# 4. Étapes de la Session 3

## Étape 1 — Architecture générale du Sync Engine

Définir précisément les responsabilités de :

- React ;
- Tauri ;
- Rust ;
- SQLite ;
- Outbox ;
- Inbox ;
- Sync Engine ;
- Supabase.

### Validation attendue

Le flux complet doit être clairement défini avant toute implémentation.

---

## Étape 2 — Identité d'une modification

Chaque modification synchronisable doit pouvoir être identifiée de façon unique.

Informations prévues :

- `mutation_id`
- `device_id`
- `user_id`
- `school_id`
- `entity_type`
- `entity_id`
- `operation`
- `created_at`
- état de synchronisation

### Objectif

Pouvoir répondre à tout moment à la question :

> Quelle modification a été effectuée, par qui, sur quel appareil, pour quelle donnée et à quel moment ?

---

## Étape 3 — Types d'opérations

Prévoir au minimum :

```text
CREATE
UPDATE
DELETE
```

Les suppressions devront respecter le mécanisme de soft delete défini pour les données synchronisables.

---

## Étape 4 — Outbox locale

L'Outbox contient les modifications locales qui doivent être envoyées à Supabase.

Exemple :

```text
Utilisateur
    ↓
Modification locale
    ↓
SQLite
    ↓
Outbox
    ↓
PENDING
```

Une mutation ne doit pas disparaître de l'Outbox simplement parce qu'Internet est indisponible.

---

## Étape 5 — Inbox locale

L'Inbox reçoit les modifications récupérées depuis Supabase avant leur application contrôlée dans SQLite.

Objectifs :

- éviter les pertes ;
- permettre le traitement contrôlé des changements entrants ;
- gérer les conflits ;
- permettre la reprise après interruption.

---

## Étape 6 — File des mutations

Les mutations devront disposer d'états explicites :

```text
PENDING
SYNCING
SYNCED
FAILED
CONFLICT
```

Le comportement de chaque état doit être défini avant l'implémentation.

---

## Étape 7 — SQLite vers Supabase

Définir le processus d'envoi :

```text
SQLite
  ↓
Outbox
  ↓
Validation
  ↓
Envoi Supabase
  ↓
Confirmation
  ↓
SYNCED
```

Une mutation ne doit être marquée `SYNCED` qu'après confirmation fiable du serveur.

---

## Étape 8 — Supabase vers SQLite

Définir le processus de récupération des changements distants :

```text
Supabase
   ↓
Détection des changements
   ↓
Inbox
   ↓
Validation
   ↓
Application SQLite
   ↓
État local mis à jour
```

---

## Étape 9 — Synchronisation manuelle

L'application doit proposer un bouton visible :

**Synchroniser**

Le bouton doit permettre à l'utilisateur de déclencher une synchronisation complète ou incrémentale selon l'état du moteur.

L'interface doit afficher au minimum :

- état de connexion ;
- dernière synchronisation ;
- mutations en attente ;
- conflits ;
- erreurs.

---

## Étape 10 — Détection des changements

Définir comment le moteur identifie :

- nouvelles données ;
- modifications ;
- suppressions ;
- données déjà synchronisées ;
- données reçues d'un autre appareil.

La synchronisation doit être incrémentale autant que possible afin d'éviter de transférer inutilement toute la base.

---

## Étape 11 — Synchronisation multi-appareils

Plusieurs appareils d'un même établissement doivent pouvoir synchroniser leurs changements via Supabase.

```text
          ┌──────────────┐
          │   Supabase   │
          └──────┬───────┘
             ▲   │   ▲
             │   │   │
       ┌─────┘   │   └─────┐
       │         │         │
   ┌───▼───┐ ┌──▼───┐ ┌───▼───┐
   │ PC 1  │ │ PC 2 │ │ PC 3  │
   │Direction│ │Prof. │ │Secr. │
   └────────┘ └──────┘ └───────┘
```

Les données doivent toujours rester limitées au `school_id` autorisé.

---

# 5. Gestion des conflits

## Étape 12 — Détection des conflits

Exemple :

```text
PC A → modifie la même donnée
PC B → modifie la même donnée
              ↓
           CONFLIT
```

Le système doit détecter les modifications concurrentes au lieu d'écraser silencieusement l'une d'elles.

---

## Étape 13 — Classification des conflits

Trois niveaux sont retenus :

### Niveau 1 — Aucun conflit

Les modifications concernent des données différentes ou peuvent être appliquées sans ambiguïté.

### Niveau 2 — Conflit automatiquement résolvable

Une règle déterministe permet de résoudre le conflit sans intervention humaine.

### Niveau 3 — Conflit critique

Une intervention est nécessaire.

Exemples possibles :

- note ;
- résultat d'examen ;
- paiement ;
- présence ;
- autre donnée sensible.

---

## Étape 14 — Résolution automatique

Définir des règles déterministes pour les conflits pouvant être résolus automatiquement.

Aucune règle implicite ou arbitraire ne doit être introduite.

---

## Étape 15 — Résolution manuelle

Pour les conflits critiques, l'application doit présenter les informations nécessaires à l'utilisateur autorisé afin de prendre une décision.

Exemple :

```text
CONFLIT

Valeur locale : 15/20
Valeur distante : 13/20

[Conserver locale]
[Conserver distante]
[Comparer / décider]
```

Le choix effectué doit être journalisé lorsque cela est pertinent.

---

# 6. Robustesse hors connexion

## Étape 16 — Perte de connexion pendant la synchronisation

Exemple :

```text
100 mutations à envoyer
        ↓
40 envoyées
        ↓
Connexion perdue
```

Les 60 mutations restantes doivent rester disponibles pour une reprise ultérieure.

Les 40 déjà confirmées ne doivent pas être envoyées comme de nouvelles mutations sans mécanisme d'idempotence approprié.

---

## Étape 17 — Reprise après interruption

Le moteur doit pouvoir reprendre après :

- coupure Internet ;
- fermeture de l'application ;
- redémarrage du PC ;
- arrêt inattendu ;
- erreur serveur temporaire.

Le processus doit être idempotent autant que possible.

---

## Étape 18 — Gestion des erreurs

Prévoir des catégories d'erreurs telles que :

```text
NETWORK_ERROR
AUTH_ERROR
LICENSE_ERROR
SERVER_ERROR
CONFLICT
VALIDATION_ERROR
PERMISSION_ERROR
UNKNOWN_ERROR
```

Chaque erreur doit avoir un comportement défini :

- réessayer ;
- attendre une action utilisateur ;
- bloquer la mutation ;
- afficher une information ;
- conserver la mutation en attente.

---

# 7. Centre de synchronisation

## Étape 19 — Interface du centre de synchronisation

L'interface devra permettre de consulter :

```text
┌──────────────────────────────────────┐
│       CENTRE DE SYNCHRONISATION      │
├──────────────────────────────────────┤
│ Connexion :           EN LIGNE       │
│ Dernière sync :       12:42          │
│ Modifications attente : 8            │
│ Conflits :             2             │
│ Erreurs :              0             │
│                                      │
│          [ Synchroniser ]            │
└──────────────────────────────────────┘
```

L'interface devra également permettre d'accéder aux détails des erreurs et conflits pour les utilisateurs autorisés.

---

# 8. Tests

## Étape 20 — Tests et validation finale

Les tests devront couvrir au minimum :

### Fonctionnement offline

- démarrage sans Internet ;
- connexion d'un utilisateur déjà autorisé ;
- création hors ligne ;
- modification hors ligne ;
- suppression hors ligne ;
- consultation des données hors ligne.

### Synchronisation

- SQLite → Supabase ;
- Supabase → SQLite ;
- synchronisation manuelle ;
- synchronisation incrémentale ;
- plusieurs appareils ;
- reprise après interruption.

### Résilience

- perte réseau pendant l'envoi ;
- fermeture de l'application pendant la synchronisation ;
- redémarrage du PC ;
- erreur serveur ;
- retry ;
- absence de doublons.

### Conflits

- conflit simple ;
- conflit automatiquement résolvable ;
- conflit critique ;
- résolution manuelle ;
- conservation de l'historique nécessaire.

### Sécurité

- isolation par `school_id` ;
- respect des rôles ;
- contrôle des accès directs ;
- RLS Supabase ;
- appareils autorisés ;
- licence ;
- absence de fuite entre établissements.

### Années scolaires

Vérifier que la synchronisation respecte :

- `academic_year_id` ;
- année active ;
- années fermées ;
- historique des années précédentes ;
- parcours des élèves.

---

# 9. Tables locales prévues

La structure définitive sera validée avant migration, mais le socle devra prévoir au minimum des mécanismes équivalents à :

## `sync_outbox`

Informations attendues :

- `id` / identifiant technique ;
- `mutation_id` ;
- `school_id` ;
- `device_id` ;
- `user_id` ;
- `entity_type` ;
- `entity_id` ;
- `operation` ;
- `payload` ;
- `created_at` ;
- `status` ;
- `attempt_count` ;
- `last_attempt_at` ;
- `last_error` ;
- informations de version/concurrence nécessaires.

## `sync_inbox`

Informations attendues :

- identifiant du changement distant ;
- `school_id` ;
- `device_id` ;
- `user_id` ;
- `entity_type` ;
- `entity_id` ;
- opération ;
- payload ;
- timestamp/version ;
- statut de traitement ;
- erreur éventuelle.

## `sync_state`

Informations attendues :

- appareil ;
- dernière synchronisation réussie ;
- curseur/version de synchronisation ;
- état du moteur ;
- dernière erreur ;
- date de dernière tentative.

> Ces noms et champs constituent une base de conception. Ils devront être définitivement validés avant la migration de production.

---

# 10. Règles d'intégration avec les Sessions 1 et 2

La Session 3 doit respecter les décisions déjà validées :

- établissement identifié par `school_id` ;
- utilisateurs gérés avec Supabase Auth ;
- rôles `DIRECTION`, `SECRETAIRE`, `PROFESSEUR`, `SUPER_ADMIN` ;
- appareils enregistrés ;
- licences ;
- audit ;
- UUID ;
- SQLite local ;
- années scolaires ;
- `academic_year_id` pour les données annuelles ;
- inscriptions et historique du parcours scolaire ;
- soft delete lorsque prévu ;
- RLS Supabase ;
- séparation stricte des établissements.

---

# 11. Ce qui n'est PAS développé dans cette session

La Session 3 ne doit pas développer les modules métier complets suivants :

- gestion complète des élèves ;
- notes ;
- présences ;
- paiements ;
- bulletins ;
- emploi du temps ;
- cahier de texte ;
- documents métier.

Le but est de construire le **moteur de synchronisation réutilisable** par ces futures fonctionnalités.

---

# 12. Ordre de développement recommandé

```text
01. Architecture Sync Engine
02. Identité des mutations
03. Types d'opérations
04. Outbox
05. Inbox
06. Queue / états
07. SQLite → Supabase
08. Supabase → SQLite
09. Synchronisation manuelle
10. Détection des changements
11. Multi-appareils
12. Détection des conflits
13. Niveaux de conflits
14. Résolution automatique
15. Résolution manuelle
16. Perte de connexion
17. Reprise
18. Gestion des erreurs
19. Centre de synchronisation
20. Tests + validation finale
```

---

# 13. Méthode de travail de l'IA

Pour chaque étape, l'IA doit utiliser le format suivant :

```text
SESSION 3 / ÉTAPE X

OBJECTIF

DÉCISIONS À VALIDER

IMPACT SUR LA BDD

IMPACT SUR SQLITE

IMPACT SUR SUPABASE

IMPACT SUR TAURI / RUST

IMPACT SUR L'INTERFACE

TESTS PRÉVUS

VALIDATION UTILISATEUR
```

Aucun changement structurel important ne doit être appliqué sans validation lorsque la décision n'a pas encore été verrouillée.

---

# 14. Critères de fin de Session 3

La Session 3 sera considérée comme terminée uniquement lorsque :

- le moteur de synchronisation fonctionne ;
- l'application fonctionne hors ligne ;
- les mutations locales sont conservées ;
- les mutations sont envoyées vers Supabase ;
- les changements distants sont récupérés ;
- plusieurs appareils peuvent synchroniser leurs données ;
- les interruptions peuvent être reprises ;
- les doublons sont évités ;
- les conflits sont détectés ;
- les conflits critiques ne sont pas écrasés silencieusement ;
- le centre de synchronisation est fonctionnel ;
- les règles de sécurité sont respectées ;
- les tests offline/online sont passés ;
- l'intégration avec les années scolaires de la Session 2 est correcte ;
- la Session 3 est explicitement validée avant de commencer la Session 4.

---

# 15. Validation de la Session 3

**Statut : VALIDÉE PAR L'UTILISATEUR**

La conception détaillée et l'implémentation technique doivent maintenant suivre les règles de ce document.
