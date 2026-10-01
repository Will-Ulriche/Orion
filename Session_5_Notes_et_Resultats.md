# SESSION 5 — Gestion des Notes & Résultats Scolaires

## Statut : ✅ VALIDÉ — 2026-10-01

---

## 1. Objectif de la session

Construire le module de gestion pédagogique de l'établissement scolaire, permettant :

- la définition des matières par classe et par année scolaire ;
- la saisie des notes d'évaluation par les professeurs ;
- le calcul automatique des moyennes (par matière, par période, générale) ;
- la gestion des coefficients par matière ;
- la génération des bulletins de notes (PDF) ;
- le suivi des résultats par classe (classements, statistiques) ;
- la synchronisation de toutes les données pédagogiques via le moteur Offline-First de la Session 3.

> Principe fondamental : toute note est annuelle. Elle doit respecter `school_id` + `academic_year_id` et être liée à une `enrollment_id` (jamais directement à un `student_id` seul).

---

## 2. Règles fondamentales pédagogiques

1. Une note est toujours liée à une **inscription** (`enrollment_id`), jamais directement à un élève seul.
2. Les matières sont définies par **année scolaire** et par **classe** (ou niveau).
3. Une note ne peut pas être supprimée — seulement **corrigée** avec motif (audit trail).
4. Le calcul de la moyenne générale tient compte des **coefficients** de chaque matière.
5. Les périodes (trimestres / semestres) sont configurables par l'établissement.
6. Toute saisie ou modification de note est tracée dans le journal d'audit (`audit_logs`).
7. Le moteur de synchronisation Session 3 gère la synchronisation de toutes les tables pédagogiques.
8. Un professeur ne peut saisir des notes que pour les classes qui lui sont **attribuées**.
9. Une année `CLOSED` ou `ARCHIVED` verrouille la saisie des notes (lecture seule).

---

## 3. Modèle de données

### 3.1 Table `subjects` — Matières

Définit les matières enseignées dans l'établissement.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `name` | TEXT | Ex : "Mathématiques", "Français" |
| `code` | TEXT | Abréviation (ex : `MATH`, `FR`) |
| `color` | TEXT | Couleur optionnelle pour l'UI |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.2 Table `class_subjects` — Affectation Matière × Classe × Année

Relie une matière à une classe pour une année donnée, avec coefficient.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `academic_year_id` | UUID | Année scolaire |
| `class_id` | UUID | Classe |
| `subject_id` | UUID | Matière |
| `teacher_id` | UUID | Professeur responsable (nullable) |
| `coefficient` | REAL | Coefficient (ex : 2.0, 3.0) |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.3 Table `grading_periods` — Périodes d'évaluation

Définit les trimestres ou semestres de l'année.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `academic_year_id` | UUID | Année scolaire |
| `name` | TEXT | Ex : "Trimestre 1", "Semestre 2" |
| `period_order` | INTEGER | Ordre d'affichage (1, 2, 3...) |
| `start_date` | DATE | Début de la période |
| `end_date` | DATE | Fin de la période |
| `is_active` | BOOLEAN | Période en cours de saisie |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.4 Table `grade_types` — Types d'évaluation

Permet de distinguer Contrôle, Examen, Devoir, Interrogation, etc.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `name` | TEXT | Ex : "Contrôle", "Examen", "Devoir" |
| `weight` | REAL | Poids relatif dans la moyenne de la matière (ex : 0.4) |
| `max_score` | REAL | Note maximale (ex : 20.0) |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.5 Table `grades` — Notes des élèves

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `academic_year_id` | UUID | Année scolaire |
| `enrollment_id` | UUID | Inscription de l'élève |
| `student_id` | UUID | Élève (redondant pour faciliter les requêtes) |
| `class_subject_id` | UUID | Matière x Classe x Année |
| `grading_period_id` | UUID | Période |
| `grade_type_id` | UUID | Type d'évaluation |
| `score` | REAL | Note obtenue (ex : 14.5) |
| `max_score` | REAL | Note maximale (ex : 20.0) |
| `evaluation_date` | DATE | Date de l'évaluation |
| `notes` | TEXT | Observations du professeur |
| `recorded_by` | UUID | Utilisateur ayant saisi la note |
| `is_absent` | BOOLEAN | TRUE si l'élève était absent (note = 0) |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.6 Table `teacher_assignments` — Attribution des classes aux professeurs

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique |
| `school_id` | UUID | Établissement |
| `academic_year_id` | UUID | Année scolaire |
| `teacher_id` | UUID | Professeur (lié à `users`) |
| `class_subject_id` | UUID | Matière x Classe |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

---

## 4. Fonctionnalités prévues

### 4.1 Configuration pédagogique (Direction)

- Créer / modifier / supprimer des matières
- Associer des matières aux classes avec coefficient
- Configurer les périodes (trimestres / semestres) de l'année
- Configurer les types d'évaluation et leurs poids
- Attribuer les classes aux professeurs

### 4.2 Saisie des notes (Professeur / Secrétariat)

- Sélectionner sa classe, sa matière et la période
- Voir la liste des élèves de la classe
- Saisir ou corriger les notes individuellement
- Marquer un élève comme absent (note forcée à 0 avec flag)
- Voir les statistiques instantanées (min, max, moyenne de la classe)

### 4.3 Consultation des résultats (Direction / Secrétariat)

- Tableau de bord par classe et par période
- Moyennes générales calculées avec coefficients
- Classements des élèves
- Statistiques par matière (distribution des notes, taux de réussite)

### 4.4 Bulletins de notes (Génération PDF)

- Bulletin individuel par élève et par période
- En-tête avec logo et informations de l'établissement
- Tableau des matières : note, coefficient, moyenne classe, appréciation
- Moyenne générale pondérée et rang dans la classe
- Appréciation générale du conseil de classe
- Signature / cachet officiel

---

## 5. Interfaces utilisateur prévues

```text
Sidebar → PÉDAGOGIE
  ├── Matières & Coefficients
  ├── Périodes d'évaluation
  ├── Saisie des notes
  ├── Résultats par classe
  └── Bulletins
```

---

## 6. Impact sur la base de données

### Nouvelles tables SQLite (via migration versionnée)

- `11_academic_module.sql`
  - `subjects`
  - `class_subjects`
  - `grading_periods`
  - `grade_types`
  - `grades`
  - `teacher_assignments`

### REMOTE_COLUMNS à ajouter (sync.rs)

```rust
("subjects", &["id", "school_id", "name", "code", "color",
  "created_at", "updated_at"]),
("class_subjects", &["id", "school_id", "academic_year_id", "class_id",
  "subject_id", "teacher_id", "coefficient", "created_at", "updated_at"]),
("grading_periods", &["id", "school_id", "academic_year_id", "name",
  "period_order", "start_date", "end_date", "is_active",
  "created_at", "updated_at"]),
("grade_types", &["id", "school_id", "name", "weight", "max_score",
  "created_at", "updated_at"]),
("grades", &["id", "school_id", "academic_year_id", "enrollment_id",
  "student_id", "class_subject_id", "grading_period_id", "grade_type_id",
  "score", "max_score", "evaluation_date", "notes", "recorded_by",
  "is_absent", "created_at", "updated_at"]),
("teacher_assignments", &["id", "school_id", "academic_year_id",
  "teacher_id", "class_subject_id", "created_at", "updated_at"]),
```

### DEPENDENCY_ORDER à compléter

```rust
("subjects", 6),
("class_subjects", 7),
("grading_periods", 7),
("grade_types", 6),
("grades", 8),
("teacher_assignments", 7),
```

---

## 7. Nouvelles commandes Tauri prévues

| Commande | Description |
|---|---|
| `get_subjects` | Lister les matières de l'établissement |
| `create_subject` | Créer une matière |
| `update_subject` | Modifier une matière |
| `delete_subject` | Supprimer une matière (si aucune note liée) |
| `get_class_subjects` | Matières affectées à une classe pour l'année |
| `assign_subject_to_class` | Affecter une matière à une classe |
| `get_grading_periods` | Lister les périodes de l'année |
| `create_grading_period` | Créer une période |
| `update_grading_period` | Modifier une période |
| `get_grade_types` | Lister les types d'évaluation |
| `create_grade_type` | Créer un type d'évaluation |
| `get_grades_by_class` | Notes d'une classe pour une matière et une période |
| `get_grades_by_student` | Toutes les notes d'un élève pour l'année |
| `upsert_grade` | Créer ou corriger une note (avec audit) |
| `get_student_averages` | Moyennes calculées par matière et générale |
| `get_class_rankings` | Classement d'une classe pour une période |
| `get_class_statistics` | Statistiques (min, max, moy, taux réussite) par matière |
| `get_teacher_assignments` | Classes attribuées à un professeur |
| `assign_teacher_to_class_subject` | Attribuer un professeur à une matière/classe |
| `generate_bulletin_data` | Agrège toutes les données d'un bulletin |

> La migration `11_academic_module.sql` doit être déclarée dans le tableau `MIGRATIONS` de
> `src-tauri/src/db.rs`.

---

## 8. Logique de calcul des moyennes

### 8.1 Moyenne d'une matière pour une période

```
Moyenne_matière = Σ(score_i × weight_i) / Σ(weight_i)
```

Exemple :
- Contrôle 1 : 12/20, poids 1
- Devoir 1 : 15/20, poids 2
- Examen T1 : 10/20, poids 3

→ Moyenne = (12×1 + 15×2 + 10×3) / (1+2+3) = (12+30+30)/6 = **12.0/20**

### 8.2 Moyenne générale pondérée

```
Moyenne_générale = Σ(Moyenne_matière_i × Coefficient_i) / Σ(Coefficient_i)
```

Le calcul est effectué côté backend Rust pour garantir la cohérence et éviter les divergences entre appareils.

---

## 9. Génération des bulletins PDF

Deux modules TypeScript, sans dépendance native (le download passe par `jsPDF.save()`).

| Module | Exports | Contenu |
|---|---|---|
| `src/lib/bulletinPdf.ts` | `buildBulletinPdf`, `saveBulletinPdf` | Bulletin A4 : en-tête établissement (logo, ministère, localisation), identité élève (nom, classe, année), tableau des matières (note, coeff, moy. classe, appréciation), moyenne générale, rang, appréciation générale, 3 signatures, cachet officiel. |
| `src/lib/classReportPdf.ts` | `buildClassReportPdf`, `saveClassReportPdf` | Rapport de classe paginé : classement complet, statistiques par matière, taux de réussite, pagination `Page n / N`. |

Points d'attention :
- Les appréciations (`Excellent`, `Bien`, `Assez Bien`, `Passable`, `Insuffisant`) sont générées automatiquement selon la moyenne.
- Le rang est calculé par période et affiché sur le bulletin (ex : `3ème / 35 élèves`).
- Le cachet est rendu à 35 % d'opacité (cohérence avec Session 4).
- Les largeurs de colonnes `autoTable` doivent sommer à la largeur utile.

---

## 10. Règles de sécurité

- Seuls `DIRECTION` et `SECRETAIRE` peuvent configurer les matières, périodes et types d'évaluation.
- `PROFESSEUR` peut saisir et corriger des notes **uniquement** pour ses classes attribuées.
- Seule la `DIRECTION` peut modifier une note après validation de période.
- Une année `CLOSED` ou `ARCHIVED` verrouille toute modification de note.
- Chaque action est tracée dans `audit_logs`.
- Les données sont isolées par `school_id`.
- RLS Supabase doit interdire l'accès cross-school à toutes les tables pédagogiques.

---

## 11. Tables Supabase à créer

Migrations Supabase identiques au schéma SQLite local (UUID, school_id, RLS).

---

## 12. Ordre de développement

```text
[x] 01. Migration SQLite (6 nouvelles tables) — 11_academic_module.sql
[x] 02. Commandes Rust : CRUD subjects + class_subjects
[x] 03. Commandes Rust : grading_periods + grade_types
[x] 04. Commandes Rust : grades (upsert + correction avec audit)
[x] 05. Commandes Rust : calcul des moyennes + classements
[x] 06. Commandes Rust : teacher_assignments
[x] 07. Enregistrement sync (REMOTE_COLUMNS + DEPENDENCY_ORDER + BOOLEAN_COLUMNS)
[x] 08. Page Configuration (matières, coefficients, périodes)
[x] 09. Page Attribution des professeurs (Inclus dans la page Pédagogie)
[x] 10. Page Saisie des notes (vue grille par classe)
[x] 11. Page Résultats par classe (tableau de bord)
[x] 12. Page Fiche élève (moyennes + historique notes)
[x] 13. Génération bulletin PDF individuel
[x] 14. Génération rapport de classe PDF
[x] 15. Intégration Sidebar (onglet PÉDAGOGIE)
[x] 16. Migration Supabase + RLS
[ ] 17. Tests offline/online + validation finale
```

---

## 13. Ce qui n'est PAS dans cette session

- Gestion des absences / présences (prévue Session 6)
- Emploi du temps et planning des cours
- Évaluations standardisées / examens nationaux
- Communication parent/professeur
- Carnets de correspondance numériques

---

## 14. Critères de fin de Session 5

La Session 5 sera considérée terminée lorsque :

- [ ] Les matières et coefficients sont configurables par année et par classe
- [ ] Les périodes d'évaluation sont définissables
- [ ] Les professeurs peuvent saisir et corriger des notes pour leurs classes attribuées
- [ ] Les moyennes sont calculées automatiquement avec coefficients (côté Rust)
- [ ] Les classements de classe sont disponibles
- [ ] Un bulletin PDF est générable par élève et par période
- [ ] Un rapport de classe PDF est générable
- [ ] Les données sont synchronisées via le moteur Session 3
- [ ] Les règles de sécurité et d'accès RBAC sont respectées
- [ ] Les tests offline/online sont passés
- [ ] La Session 5 est explicitement validée

---

## 15. Validation

**Statut : ✅ VALIDÉ par l'utilisateur le 2026-10-01**

Le plan de la Session 5 est approuvé. Le développement peut commencer dans l'ordre défini à la section 12.
