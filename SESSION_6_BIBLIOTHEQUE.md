# SESSION 6 — GESTION DE LA BIBLIOTHÈQUE

## Statut : ✅ VALIDÉ — 2026-10-22

---

## 1. Objectif de la session

Construire le module de gestion de la bibliothèque de l'établissement :

- le **catalogue des livres** (ouvrages) ;
- les **catégories** de classement ;
- les **exemplaires et l'inventaire** (chaque exemplaire physique d'un ouvrage) ;
- les **lecteurs** (élèves, personnels, lecteurs externes) ;
- le **nouvel emprunt** ;
- les **retours** ;
- les **retards et pénalités** ;
- les **réservations**.

> Principe fondamental : la bibliothèque est rattachée à l'établissement
> (`school_id`). Un ouvrage est une notice ; un exemplaire est le volume physique.
> Un emprunt porte toujours sur un **exemplaire**, jamais sur une notice.

---

## 2. Règles fondamentales de gestion

1. Toute donnée de bibliothèque est isolée par `school_id`.
2. Un **ouvrage** (`library_books`) appartient à une **catégorie** (`library_categories`).
3. Un **exemplaire** (`library_copies`) appartient à un **ouvrage** et porte un
   **code d'inventaire** unique par établissement.
4. Un **lecteur** (`library_readers`) est une fiche de prêt : élève, personnel ou
   lecteur externe. Un élève ne possède qu'une seule fiche de lecteur.
5. Un **emprunt** (`library_loans`) lie obligatoirement un exemplaire **et** un
   lecteur. Il porte une date d'échéance calculée à partir des paramètres de la
   bibliothèque.
6. Un **retour** (`library_returns`) clôt un emprunt et renseigne l'état du
   document, le nombre de jours de retard et le montant de la pénalité.
7. Un **retard** se calcule à partir de la date d'échéance, du délai de grâce et
   du montant journalier défini dans `library_settings`.
8. Une **réservation** (`library_reservations`) porte sur un **ouvrage** (pas sur
   un exemplaire) et satisfied dès qu'un exemplaire est disponible.
9. Toute opération sensible (création, emprunt, retour, pénalité, réservation)
   est journalisée dans `audit_logs`.
10. Les données sont synchronisées via le moteur Offline-First (Session 3) :
    tables déclarées dans `REMOTE_COLUMNS` + `DEPENDENCY_ORDER`.

### Statuts normalisés

| Entité | Valeurs |
|---|---|
| Exemplaire | `DISPONIBLE`, `EMPRUNTE`, `PERDU`, `MAINTENANCE`, `RETIRE` |
| Lecteur | `ACTIF`, `SUSPENDU`, `EXPIRE` |
| Emprunt | `EN_COURS`, `RETOURNE`, `PERDU` |
| Pénalité | `EN_ATTENTE`, `PAYEE`, `ANNULEE`, `REMISEE` |
| Réservation | `EN_ATTENTE`, `DISPONIBLE`, `SATISFAITE`, `ANNULEE`, `EXPIREE` |

---

## 3. Modèle de données

### 3.1 `library_categories` — Catégories

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `name` | TEXT | Libellé (ex : "Littérature") |
| `code` | TEXT | Abréviation (ex : `LIT`) |
| `description` | TEXT | Description libre |
| `color` | TEXT | Couleur d'affichage |
| `created_at` / `updated_at` | TEXT | Horodatages |

### 3.2 `library_books` — Catalogue (ouvrages)

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `category_id` | TEXT | Catégorie (nullable) |
| `isbn` | TEXT | ISBN (unique par établissement) |
| `title` | TEXT | Titre |
| `author` | TEXT | Auteur |
| `publisher` | TEXT | Éditeur |
| `publication_year` | INTEGER | Année de publication |
| `language` | TEXT | Langue (défaut `Français`) |
| `edition` | TEXT | Édition |
| `pages` | INTEGER | Pagination |
| `description` | TEXT | Résumé |
| `shelf_location` | TEXT | Rayonnage / cote |
| `is_reference` | INTEGER | 1 si ouvrage de référence (consultation sur place) |
| `created_at` / `updated_at` | TEXT | Horodatages |

### 3.3 `library_copies` — Exemplaires & inventaire

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `book_id` | TEXT | Ouvrage |
| `inventory_code` | TEXT | Code d'inventaire (unique par établissement) |
| `barcode` | TEXT | Code-barres |
| `status` | TEXT | `DISPONIBLE` … `RETIRE` |
| `condition` | TEXT | État : `Neuf`, `Bon`, `Satisfaisant`, `Mauvais`, `Hors service` |
| `acquisition_date` | TEXT | Date d'acquisition |
| `acquisition_source` | TEXT | Source (don, achat, legs…) |
| `price` | REAL | Prix d'acquisition |
| `location` | TEXT | Emplacement physique |
| `notes` | TEXT | Observations |
| `created_at` / `updated_at` | TEXT | Horodatages |

### 3.4 `library_readers` — Lecteurs

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `reader_type` | TEXT | `ELEVE`, `PERSONNEL`, `EXTERNE` |
| `student_id` | TEXT | Élève (nullable, unique) |
| `staff_id` | TEXT | Personnel (nullable) |
| `full_name` | TEXT | Nom complet affiché |
| `email` / `phone` | TEXT | Contact |
| `card_number` | TEXT | Numéro de carte (unique par établissement) |
| `class_name` | TEXT | Classe (élèves) |
| `max_loans` | INTEGER | Nombre maximum d'emprunts simultanés |
| `status` | TEXT | `ACTIF`, `SUSPENDU`, `EXPIRE` |
| `registered_at` / `expires_at` | TEXT | Dates |
| `notes` | TEXT | Observations |

### 3.5 `library_loans` — Emprunts

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `copy_id` | TEXT | Exemplaire emprunté |
| `reader_id` | TEXT | Lecteur |
| `book_id` | TEXT | Ouvrage (dénormalisé pour les listes) |
| `loan_date` | TEXT | Date du prêt |
| `due_date` | TEXT | Date d'échéance |
| `returned_at` | TEXT | Date de retour (vide si en cours) |
| `status` | TEXT | `EN_COURS`, `RETOURNE`, `PERDU` |
| `loan_condition` | TEXT | État au prêt |
| `notes` | TEXT | Observations |
| `created_by` | TEXT | Agent ayant enregistré le prêt |

### 3.6 `library_returns` — Retours

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `loan_id` | TEXT | Emprunt clôturé |
| `copy_id` / `reader_id` | TEXT | Rappel de l'exemplaire et du lecteur |
| `returned_at` | TEXT | Date du retour |
| `loan_condition` | TEXT | État constaté au retour |
| `late_days` | INTEGER | Jours de retard (hors délai de grâce) |
| `fine_amount` | REAL | Montant de la pénalité de retard |
| `remarks` | TEXT | Observations |
| `handled_by` | TEXT | Agent ayant enregistré le retour |

### 3.7 `library_penalties` — Pénalités

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `reader_id` | TEXT | Lecteur concerné |
| `loan_id` | TEXT | Emprunt d'origine (nullable) |
| `penalty_type` | TEXT | `RETARD`, `PERTE`, `DEGRADATION`, `AUTRE` |
| `amount` | REAL | Montant |
| `days_late` | INTEGER | Jours de retard |
| `description` | TEXT | Détail |
| `status` | TEXT | `EN_ATTENTE`, `PAYEE`, `ANNULEE`, `REMISEE` |
| `paid_at` | TEXT | Date de règlement |

### 3.8 `library_reservations` — Réservations

| Colonne | Type | Description |
|---|---|---|
| `id` | TEXT | Identifiant unique |
| `school_id` | TEXT | Établissement |
| `book_id` | TEXT | Ouvrage réservé |
| `reader_id` | TEXT | Lecteur |
| `reserved_at` | TEXT | Date de la réservation |
| `available_at` | TEXT | Date de disponibilité annoncée |
| `expires_at` | TEXT | Expiration de la réservation |
| `status` | TEXT | `EN_ATTENTE`, `DISPONIBLE`, `SATISFAITE`, `ANNULEE`, `EXPIREE` |
| `queue_position` | INTEGER | Position dans la file d'attente |
| `notified_at` | TEXT | Notification au lecteur |
| `fulfilled_at` | TEXT | Réservation satisfaite |
| `loan_id` | TEXT | Emprunt issu de la réservation |

### 3.9 `library_settings` — Paramètres

| Colonne | Type | Défaut |
|---|---|---|
| `loan_duration_days` | INTEGER | 14 jours de prêt |
| `max_loans_per_reader` | INTEGER | 3 emprunts simultanés |
| `fine_per_day` | REAL | 100 (unité monétaire) par jour de retard |
| `grace_days` | INTEGER | 0 jour de grâce |
| `reservation_expiry_days` | INTEGER | 7 jours |

---

## 4. Règles métier du cycle d'emprunt

### 4.1 Nouvel emprunt

```text
Lecteur ACTIF ?
  ├─ non → REFUS "Lecteur inactif"
Exemplaire DISPONIBLE ?
  ├─ non → REFUS "Exemplaire indisponible"
Ouvrage de référence (is_reference = 1) ?
  ├─ oui → REFUS "Consultation sur place uniquement"
Emprunts en cours < max_loans ?
  ├─ non → REFUS "Limite d'emprunts atteinte"
sinon
  └─ EMPRUNT créé + exemplaire → EMPRUNTE
```

La durée du prêt est calculée côté Rust :
`due_date = loan_date + loan_duration_days`.

Si le lecteur avait une réservation `EN_ATTENTE` sur cet ouvrage, elle passe à
`SATISFAITE` et l'emprunt created lui est rattaché.

### Ouvrages de référence

Les manuels, dictionnaires et atlas (`is_reference = 1`) restent consultables
sur place : ils ne sont **jamais** prêtés ni réservés. La règle est appliquée
côté Rust (`create_library_loan_inner`, `create_library_reservation`) et le
formulaire de prêt du front ne propose que les exemplaires prêtables.

### 4.2 Retour

```text
late_days  = max(0, (returned_at - due_date) - grace_days)
fine_amount = late_days × fine_per_day
```

- l'emprunt passe à `RETOURNE` ;
- l'exemplaire repasse à `DISPONIBLE` avec son nouvel état ;
- une pénalité `RETARD` est créée si `late_days > 0` ;
- la plus ancienne réservation `EN_ATTENTE` sur cet ouvrage passe à `DISPONIBLE`.

### 4.3 Réservation

- porte sur l'ouvrage ;
- position dans la file recalculée à chaque nouvelle réservation ;
- `DISPONIBLE` lorsque le retour d'un exemplaire la concerne ;
- `SATISFAITE` quand le lecteur emprunte l'ouvrage.

---

## 5. Jeu de démonstration

La commande `seed_library_demo_data` insère un jeu de données cohérent et
**relié** :

- 6 catégories ;
- 14 ouvrages rattachés à ces catégories (dont 4 ouvrages de référence) ;
- 33 exemplaires (codes `BIB-0001`…) ;
- des lecteurs **élèves** rattachés aux élèves réellement inscrits, des lecteurs
  **personnel** rattachés au personnel, des lecteurs **externes** ;
- des emprunts en cours (dont plusieurs en retard), l'historique des retours ;
- les pénalités correspondantes (en attente, payée, remise) ;
- des réservations (en attente, disponible, satisfaite) ;
- 2 exemplaires hors circuit (`PERDU`, `MAINTENANCE`).

Cohérence garantie par le test `library::tests::seed_demo_library_is_coherent` :
aucun emprunt sur un ouvrage de référence, aucun exemplaire prêtable et libre
simultanément, aucun double prêt, aucune réservation « en attente » sur un
ouvrage dont un exemplaire est libre, aucune réservation « satisfaite » sans
emprunt soldé, aucun lecteur au-delà de son quota, chaque retard couvert par
une pénalité.

La commande `clear_library_data` purge les données de l'établissement avant
réinitialisation.

---

## 6. Interfaces utilisateur prévues

```text
Sidebar → BIBLIOTHÈQUE
  ├── Tableau de bord (KPI)
  ├── Catalogue des livres
  ├── Catégories
  ├── Exemplaires & inventaire
  ├── Lecteurs
  ├── Emprunts & retours
  ├── Retards & pénalités
  └── Réservations
```

---

## 7. Impact sur la base de données

### Migration SQLite

- `24_library_module.sql` — 9 tables (8 métier + paramètres).

### `REMOTE_COLUMNS` (commands.rs)

```rust
("library_categories", &[...]),
("library_books",     &[...]),
("library_copies",    &[...]),
("library_readers",   &[...]),
("library_loans",     &[...]),
("library_returns",   &[...]),
("library_penalties", &[...]),
("library_reservations", &[...]),
```

### Migration Supabase

- `supabase/migrations/20261022000000_library_module.sql` — mêmes 9 tables en
  PostgreSQL (UUID / TIMESTAMPTZ), index, triggers `updated_at`, RLS par
  établissement et ajout des tables bibliothèque à `delete_school_cascade`.
- `library_settings` est créée en distant mais **n'est pas synchronisée** : les
  paramètres restent propres à chaque poste.
- `library_readers.staff_id` est conservé **sans clé étrangère** : le module
  personnel n'existe pas encore en base distante (`public.staff` absent), la FK
  rendrait la migration et la synchronisation des lecteurs impossibles.

### `DEPENDENCY_ORDER` (sync.rs)

```rust
("library_categories", 9),
("library_books",     10),
("library_readers",   10),
("library_copies",    11),
("library_loans",     12),
("library_returns",   13),
("library_penalties", 13),
("library_reservations", 13),
```

---

## 8. Nouvelles commandes Tauri

| Commande | Description |
|---|---|
| `get_library_settings` | Lire les paramètres de la bibliothèque |
| `save_library_settings` | Modifier les paramètres |
| `get_library_categories` | Lister les catégories (+ nombre d'ouvrages) |
| `create_library_category` | Créer une catégorie |
| `update_library_category` | Modifier une catégorie |
| `delete_library_category` | Supprimer une catégorie |
| `get_library_books` | Lister le catalogue (filtres catégorie / recherche) |
| `create_library_book` | Créer un ouvrage |
| `update_library_book` | Modifier un ouvrage |
| `delete_library_book` | Supprimer un ouvrage (refusé si emprunt en cours) |
| `get_library_copies` | Lister les exemplaires (filtre ouvrage / statut) |
| `create_library_copies` | Ajouter N exemplaires d'un ouvrage |
| `update_library_copy` | Modifier un exemplaire |
| `delete_library_copy` | Retirer un exemplaire (refusé si emprunté) |
| `get_library_readers` | Lister les lecteurs (+ emprunts en cours) |
| `create_library_reader` | Créer une fiche de lecteur |
| `update_library_reader` | Modifier une fiche de lecteur |
| `delete_library_reader` | Supprimer une fiche de lecteur |
| `register_student_as_reader` | Inscrire un élève comme lecteur |
| `get_library_loans` | Lister les emprunts (en cours / historique) |
| `create_library_loan` | Enregistrer un nouvel emprunt |
| `return_library_loan` | Enregistrer un retour (+ pénalité) |
| `extend_library_loan` | Prolonger un emprunt de N jours |
| `get_library_penalties` | Lister les pénalités |
| `pay_library_penalty` | Marquer une pénalité comme payée |
| `waive_library_penalty` | Remettre une pénalité |
| `get_library_reservations` | Lister les réservations |
| `create_library_reservation` | Réserver un ouvrage |
| `cancel_library_reservation` | Annuler une réservation |
| `fulfill_library_reservation` | Satisfaire une réservation (crée l'emprunt) |
| `get_library_dashboard` | Indicateurs de pilotage |
| `seed_library_demo_data` | Insérer le jeu de démonstration |
| `clear_library_data` | Purger les données de bibliothèque |

---

## 9. Règles de sécurité

- Accès à la page : `DIRECTION`, `SECRETAIRE` (déjà en place dans `Sidebar.tsx`
  et `App.tsx`).
- Toutes les commandes filtrent par `school_id` : aucune fuite inter-établissement.
- Suppression refusée si des enfants existent (ouvrage avec emprunt en cours,
  exemplaire prêté, catégorie avec ouvrages).
- Journalisation dans `audit_logs` pour les écritures sensibles.

---

## 10. Ordre de développement

```text
[x] 01. Migration SQLite (9 tables)
[x] 02. Modèles Rust
[x] 03. Commandes CRUD (catégories, ouvrages, exemplaires, lecteurs)
[x] 04. Commandes emprunt / retour / prolongation
[x] 05. Commandes pénalités / réservations
[x] 06. Indicateurs de pilotage + jeu de démonstration
[x] 07. Enregistrement sync (REMOTE_COLUMNS + DEPENDENCY_ORDER + upsert)
[x] 08. Migration Supabase + RLS
[x] 09. Page Bibliothèque (7 onglets)
[x] 10. Tests de compilation (cargo check + build front)
[x] 11. Tests unitaires métier (cargo test) + cohérence du jeu de démonstration
```

---

## 11. Tests

```text
cargo test --manifest-path src-tauri\Cargo.toml --lib
```

| Test | Rôle |
|------|------|
| `library::tests::seed_demo_library_is_coherent` | Cohérence complète du jeu de démonstration |
| `library::tests::create_loan_refuses_reference_book` | Refus de prêt d'un ouvrage de référence |
| `library::tests::create_loan_enforces_quota` | Quota d'emprunts par lecteur |
| `library::tests::return_loan_computes_late_days_and_penalty` | Retard, pénalité et remise en stock |
| `library::tests::loan_satisfies_pending_reservation` | Satisfaction automatique d'une réservation |

Les commandes métier critiques sont factorisées en fonctions internes
(`create_library_loan_inner`, `return_library_loan_inner`,
`seed_library_demo_data_inner`) qui prennent `&Connection` : elles sont donc
testables sans runtime Tauri, la couche `#[tauri::command]` ne fait qu'un
verrouillage de la base puis délègue.

---

## 12. Critères de fin de Session 6

- [x] Catalogue des livres avec recherche et filtre par catégorie
- [x] Catégories gérables
- [x] Exemplaires et inventaire (ajout en lot, code d'inventaire unique)
- [x] Lecteurs (élèves, personnels, externes)
- [x] Nouvel emprunt (contrôles : lecteur actif, exemplaire disponible, quota)
- [x] Retours (état, jours de retard, pénalité)
- [x] Retards et pénalités (suivi, règlement, remise)
- [x] Réservations (file d'attente, disponibilité, satisfaction)
- [x] Données de démonstration insérées et reliées
- [x] Synchronisation déclarée (outbox + inbox)
- [x] UI et code compilés
- [x] Règles métier couvertes par des tests unitaires
