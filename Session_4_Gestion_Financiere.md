# SESSION 4 — Gestion Financière (Frais Scolaires & Paiements)

## Statut : EN COURS DE CONCEPTION

---

## 1. Objectif de la session

Construire le module de gestion financière de l'établissement scolaire, permettant :

- la définition des frais scolaires par année et par classe ;
- l'enregistrement des paiements des élèves ;
- le suivi de la situation financière individuelle (solde, reliquat) ;
- la génération de reçus de paiement ;
- le tableau de bord financier (recettes, impayés, taux de recouvrement) ;
- la synchronisation de toutes les données financières via le moteur Offline-First de la Session 3.

> Principe fondamental : toute donnée financière est annuelle. Elle doit respecter `school_id` + `academic_year_id`.

---

## 2. Règles fondamentales financières

1. Un paiement est toujours lié à une **inscription** (`enrollment_id`), jamais directement à un élève seul.
2. Un frais scolaire est défini par **année scolaire** et peut être affiné par **classe** ou **niveau**.
3. Un paiement ne peut jamais dépasser le montant total dû (à valider côté backend).
4. Un paiement ne peut pas être supprimé — seulement **annulé** avec motif (soft delete + audit).
5. Toute action financière est tracée dans le journal d'audit.
6. Le moteur de synchronisation Session 3 gère la synchronisation de toutes les tables financières.
7. Les montants sont stockés en **centimes (entiers)** pour éviter les erreurs de virgule flottante.

---

## 3. Modèle de données

### 3.1 Table `fee_structures` — Grille tarifaire

Définit les frais applicables pour une année scolaire donnée.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `academic_year_id` | UUID | Année scolaire |
| `name` | TEXT | Ex : "Frais de scolarité T1", "Inscription" |
| `amount` | INTEGER | Montant en centimes (ex: 25000 XOF = 2500000) |
| `fee_type` | TEXT | `INSCRIPTION` / `SCOLARITE` / `TRANSPORT` / `CANTINE` / `AUTRE` |
| `applies_to` | TEXT | `ALL` / `CLASS` / `LEVEL` |
| `class_id` | UUID | Si applies_to = CLASS |
| `level` | TEXT | Si applies_to = LEVEL |
| `due_date` | DATE | Échéance optionnelle |
| `is_mandatory` | BOOLEAN | Frais obligatoire |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.2 Table `payments` — Paiements effectués

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `academic_year_id` | UUID | Année scolaire |
| `enrollment_id` | UUID | Inscription de l'élève |
| `student_id` | UUID | Élève (redondant pour faciliter les requêtes) |
| `fee_structure_id` | UUID | Frais concerné (nullable si paiement libre) |
| `amount` | INTEGER | Montant payé en centimes |
| `payment_date` | DATE | Date du paiement |
| `payment_method` | TEXT | `ESPECES` / `MOBILE_MONEY` / `VIREMENT` / `CHEQUE` |
| `reference` | TEXT | Référence externe (numéro reçu mobile, chèque...) |
| `receipt_number` | TEXT | Numéro de reçu généré automatiquement |
| `notes` | TEXT | Observations |
| `recorded_by` | UUID | Utilisateur ayant enregistré le paiement |
| `status` | TEXT | `VALID` / `CANCELLED` |
| `cancelled_at` | DATETIME | Si annulé |
| `cancel_reason` | TEXT | Motif d'annulation |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

## 4. Fonctionnalités prévues

### 4.1 Configuration des frais (Direction)

- Créer / modifier / supprimer une grille tarifaire pour l'année active
- Définir des frais globaux ou par classe / niveau
- Visualiser la grille complète de l'année

### 4.2 Enregistrement des paiements (Secrétariat)

- Sélectionner un élève inscrit
- Voir sa situation financière (dû / payé / reliquat)
- Enregistrer un nouveau paiement
- Choisir le mode de paiement
- Générer et imprimer un reçu PDF
- Annuler un paiement (avec motif)

### 4.3 Tableau de bord financier (Direction)

- Total attendu sur l'année
- Total encaissé
- Taux de recouvrement (%)
- Liste des élèves avec reliquat
- Filtres : par classe, par type de frais, par statut

---

## 5. Interfaces utilisateur prévues

```text
Sidebar → FINANCES
  ├── Grille tarifaire
  ├── Paiements
  └── Tableau de bord financier
```

---

## 6. Impact sur la base de données

### Nouvelles tables SQLite (via migration versionnée)

- `10_financial_module.sql`
  - `fee_structures`
  - `payments`

### REMOTE_COLUMNS à ajouter (sync.rs)

```rust
("fee_structures", &["id", "school_id", "academic_year_id", "name", "amount",
  "fee_type", "applies_to", "class_id", "level", "due_date",
  "is_mandatory", "created_at", "updated_at"]),
("payments", &["id", "school_id", "academic_year_id", "enrollment_id",
  "student_id", "fee_structure_id", "amount", "payment_date",
  "payment_method", "reference", "receipt_number", "notes",
  "recorded_by", "status", "cancelled_at", "cancel_reason",
  "created_at", "updated_at"]),
```

### DEPENDENCY_ORDER à compléter

```rust
("fee_structures", 4),
("payments", 5),
```

---

## 7. Nouvelles commandes Tauri prévues

| Commande | Description |
|---|---|
| `get_fee_structures` | Lister les frais de l'année |
| `create_fee_structure` | Créer un frais |
| `update_fee_structure` | Modifier un frais |
| `delete_fee_structure` | Supprimer un frais (si aucun paiement lié) |
| `get_student_payments` | Paiements d'un élève pour l'année |
| `get_student_financial_summary` | Situation financière (dû / payé / reliquat) |
| `create_payment` | Enregistrer un paiement |
| `cancel_payment` | Annuler un paiement (soft) |
| `get_financial_dashboard` | Données du tableau de bord (totaux, recouvrement, par classe, impayés) |
| `generate_receipt_number` | Génère un numéro de reçu séquentiel unique |

> La migration `10_financial_module.sql` doit être déclarée dans le tableau `MIGRATIONS` de
> `src-tauri/src/db.rs`, sans quoi les tables `fee_structures` / `payments` ne sont jamais créées.

---

## 8. Règles de sécurité

- Seuls `DIRECTION` et `SECRETAIRE` peuvent enregistrer des paiements.
- Seule la `DIRECTION` peut annuler un paiement ou modifier la grille tarifaire.
- Chaque action est tracée dans `audit_logs`.
- Les données financières sont isolées par `school_id`.
- RLS Supabase doit interdire l'accès cross-school aux tables `fee_structures` et `payments`.

---

## 9. Tables Supabase à créer

Migrations Supabase identiques au schéma SQLite local (UUID, school_id, RLS).

---

## 10. Ordre de développement

```text
[x] 01. Migration SQLite (fee_structures + payments)
[x] 02. Commandes Rust backend (CRUD fee_structures)
[x] 03. Commandes Rust backend (CRUD payments + summary)
[x] 04. Enregistrement sync (REMOTE_COLUMNS + DEPENDENCY_ORDER)
[x] 05. Page Grille tarifaire (frontend)
[x] 06. Page Paiements élève (frontend)
[x] 07. Page Tableau de bord financier (frontend)
[x] 08. Génération de reçu (numérotation automatique)
[x] 09. Impression / export PDF (reçu + rapport)
[x] 10. Intégration Sidebar (onglet FINANCES)
[ ] 11. Migration Supabase + RLS
[ ] 12. Tests offline/online + validation finale
```

### Exports PDF

Deux modules TypeScript, sans dépendance native (le download passe par `jsPDF.save()`,
donc le blob est produit par le WebView — aucun accès disque requis côté Rust).

| Module | Exports | Contenu |
| --- | --- | --- |
| `src/lib/receiptPdf.ts` | `buildReceiptPdf`, `saveReceiptPdf`, `amountToFrenchWords`, `formatMoney`, `formatDate` | Reçu A4 une page : en-tête établissement (logo, ministère, localisation), bandeau `REÇU ANNULÉ` le cas échéant, identité élève + mode de règlement, tableau du règlement, montant en lettres, situation de l'élève, observations, 3 signatures, cachet officiel. |
| `src/lib/financeReportPdf.ts` | `buildFinanceReportPdf`, `saveFinanceReportPdf` | Rapport financier paginé : synthèse (4 KPI), grille tarifaire, recouvrement par classe (avec ligne TOTAL), modes d'encaissement, liste des reliquats (SOUS-TOTAL + mention de troncature à 100 lignes), pagination `Page n / N`. |

Points d'attention :

- `amountToFrenchWords` gère les groupes de 3 chiffres jusqu'au `billion` ; `mille` est
  invariable (`mille`, et non `un mille`).
- Les largeurs de colonnes `autoTable` doivent sommer à la largeur utile, sinon la
  library n'alloue pas la différence et tronque la table.
- `stamp_url`, `signature_url`, `head_title`, `head_name` et `slogan` sont lus dans les
  réglages de l'établissement ; le cachet est rendu à 35 % d'opacité.
- Les observations sont tronquées à 4 lignes pour ne pas empiéter sur les signatures.

---

## 11. Ce qui n'est PAS dans cette session

- Salaires du personnel
- Comptabilité générale
- Budget prévisionnel
- Gestion des bourses et aides
- Intégration bancaire externe

---

## 12. Critères de fin de Session 4

La Session 4 sera considérée terminée lorsque :

- [x] Les frais scolaires peuvent être configurés par année
- [x] Les paiements peuvent être enregistrés et annulés
- [x] La situation financière d'un élève est consultable
- [x] Un reçu numéroté est généré automatiquement
- [x] Le tableau de bord financier est fonctionnel
- [x] Les données sont synchronisées via le moteur Session 3
- [x] Les règles de sécurité et d'accès sont respectées
- [ ] Les tests offline/online sont passés
- [ ] La Session 4 est explicitement validée

---

## 13. Validation

**Statut : EN ATTENTE DE VALIDATION UTILISATEUR**
