# ORION_PEDAGOGICAL_ANALYSIS

## A. Architecture actuelle d'Orion
L'architecture actuelle d'Orion est basée sur une approche **offline-first** (Rust/Tauri pour le backend local SQLite, et React pour le frontend), avec un système d'Outbox/Mutations en attente pour la synchronisation vers Supabase. Orion gère déjà les années scolaires, les inscriptions (enrollments), les écoles, et possède un module financier robuste.

## B. Structure pédagogique actuelle d'Orion
Dans Orion (d'après les fichiers `04_session2_academic_years.sql` et `11_academic_module.sql`), la structure est assez plate et centrée sur l'essentiel :
- `classes` : possède un champ texte `level` basique, sans hiérarchie complexe.
- `subjects` : catalogue global des matières.
- `class_subjects` : lie une classe, une matière et une année, et inclut déjà le **coefficient** et un `teacher_id` par défaut.
- `teacher_assignments` : lie explicitement un professeur à un `class_subject_id` pour la gestion multi-professeurs.
- `grades` / `grade_types` / `grading_periods` : architecture solide liant la note directement à `class_subject_id` et `enrollment_id`.

## C. Structure pédagogique de Nia
Nia utilise une structure pédagogique fortement hiérarchisée :
- `sections` (ex: Collège, Lycée)
- `levels` (ex: 6ème, Seconde) -> lié à une section
- `series` (ex: Littéraire, Scientifique, A, C) -> lié à un niveau
- `classes` (ex: 6ème A, Seconde C) -> lié à un niveau, une année scolaire, et potentiellement une série.
- `class_subjects` -> très complet, avec `coefficient`, mais aussi `weekly_hours`, `subject_type`, `is_mandatory`, `color_icon`, `order_index`.
- `subject_templates` / `subject_template_items` -> permet de pré-définir des listes de matières et de coefficients pour les appliquer rapidement à une classe.

## D. Comparaison Orion / Nia

| Fonction | Nia | Orion | Action |
| --- | --- | --- | --- |
| **Année scolaire** | Table `academic_years` | Table `academic_years` | **Conserver** (Orion gère déjà très bien l'unicité et le statut). |
| **Section** | Table `sections` | Inexistant | **Adapter** : Créer la table dans Orion. |
| **Niveau** | Table `levels` (lié à section) | Champ texte `level` dans `classes` | **Adapter** : Créer la table `levels` et lier `classes` à `levels`. |
| **Série** | Table `series` (lié à level) | Inexistant | **Adapter** : Créer la table `series` (optionnelle pour une classe). |
| **Classe** | Liée à level, series, year | Liée à year, avec champ level | **Adapter** : Remplacer le champ `level` par `level_id` et `series_id`. |
| **Matière** | Table `subjects` | Table `subjects` | **Conserver** Orion, peut-être ajouter `description`. |
| **Matière → Classe** | Table `class_subjects` | Table `class_subjects` | **Conserver** Orion, mais ajouter les colonnes utiles de Nia (`weekly_hours`, `subject_type`, `is_mandatory`, `order_index`). |
| **Coefficient** | Dans `class_subjects` | Dans `class_subjects` | **Conserver** (L'approche est la même et Orion l'a déjà). |
| **Professeur** | Dans `class_subjects` & `teacher_assignments` | Identique à Nia | **Conserver** l'approche existante d'Orion. |
| **Notes** | Liées à l'évaluation | Liées à `class_subject_id` | **Conserver** Orion. Le système de notes d'Orion est fonctionnel et lié aux inscriptions (enrollments). |
| **Moyennes** | Table `averages` | Calcul dynamique ou table spécifique (en cours) | **Conserver/Adapter** la logique d'Orion pour ne pas casser l'existant. |

## E. Fonctionnalités déjà fonctionnelles dans Orion
- L'architecture Offline-First avec les mutations (Outbox).
- Le cycle de vie complet des années scolaires (`academic_years`).
- L'inscription des élèves (`enrollments`) liée aux années scolaires et classes.
- Le catalogue de matières (`subjects`) et son affectation de base (`class_subjects`).
- L'attribution des notes (`grades`) sur base du `class_subject_id`.

## F. Fonctionnalités pédagogiques manquantes dans Orion
- La hiérarchie structurelle : Section → Niveau → Série.
- Les propriétés étendues de l'affectation pédagogique (heures hebdomadaires, obligatoire/facultatif, type de matière).
- Les modèles de matières (`subject_templates`) de Nia (à implémenter en priorité basse, après le reste).

## G. Tables concernées
- **Nouvelles tables à créer :** `sections`, `levels`, `series`.
- **Tables à modifier :** `classes` (ajout `level_id`, `series_id`, suppression `level` texte), `class_subjects` (ajout `weekly_hours`, `subject_type`, `is_mandatory`, `order_index`).

## H. Fichiers concernés
- Migrations SQLite et Supabase (`04_session2_academic_years.sql`, `11_academic_module.sql`, ou nouvelle migration).
- Modèles Rust (`src-tauri/src/models/`).
- Repositories/Commandes Tauri (`src-tauri/src/commands/`).
- Types TypeScript (`src/types/`).
- Services frontend React (`src/services/`).
- Composants de gestion des classes et matières (`src/pages/`, `src/components/`).

## I. Commandes Tauri concernées
- Commandes de création/mise à jour de classe (à adapter pour inclure le niveau et la série).
- Nouvelles commandes CRUD pour Section, Niveau, Série.
- Commandes de création/mise à jour de `class_subjects` (à étendre avec les nouveaux champs).

## J. Composants frontend concernés
- Formulaire de création de classe (sélection en cascade : Section -> Niveau -> Série).
- Interface de gestion des matières de la classe (ajout des colonnes Coefficient, Heures, Type).
- Dashboard académique ou paramètres de l'établissement.

## K. Synchronisation concernée
- Les nouvelles tables (`sections`, `levels`, `series`) doivent être intégrées au système d'Outbox (`mutations_queue`) et répliquées sur Supabase.
- La modification de la table `classes` nécessitera une attention particulière lors de la synchronisation si des classes existent déjà.

## L. Risques de modification
- Casser l'affichage des classes existantes si le champ `level` est supprimé sans migration des données existantes.
- Casser le module d'inscription (`enrollments`) qui pointe vers `classes`.
- Complexifier inutilement l'interface si l'école n'utilise pas de séries (le champ doit être nullable).

## M. Plan de migration minimal
1. **Base de données :** Créer une nouvelle migration `12_pedagogical_structure.sql` pour ajouter `sections`, `levels`, `series`. Modifier `classes` (ajouter `level_id`, `series_id`) et `class_subjects` (ajouter les nouvelles colonnes).
2. **Modèles Rust & Tauri :** Définir les `structs` pour les nouvelles tables et créer les commandes CRUD basiques.
3. **Frontend - Services :** Ajouter les appels Tauri.
4. **Frontend - UI :** Créer les écrans de paramétrage de la structure (Sections, Niveaux, Séries) et adapter le formulaire de classe existant.
5. **Validation :** Tester le tout offline, fermer l'app, rouvrir, synchroniser, vérifier Supabase.
6. **Bonus (Phase 2) :** Implémenter les `subject_templates` si demandé.
