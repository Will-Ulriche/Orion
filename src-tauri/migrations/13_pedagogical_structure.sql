-- ============================================================
-- Migration: 12_pedagogical_structure
-- Description: Intégration de la structure pédagogique avancée (Nia)
-- Sections -> Niveaux -> Séries -> Classes
-- ============================================================

-- 1. Sections (ex: Maternelle, Primaire, Collège, Lycée)
CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE INDEX IF NOT EXISTS idx_sections_school ON sections(school_id);

-- 2. Niveaux (ex: 6ème, 5ème, Seconde)
CREATE TABLE IF NOT EXISTS levels (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    name TEXT NOT NULL,
    level_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_levels_section ON levels(section_id);
CREATE INDEX IF NOT EXISTS idx_levels_school ON levels(school_id);

-- 3. Séries (ex: Scientifique, Littéraire, A, C - Optionnel)
CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    level_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_series_level ON series(level_id);
CREATE INDEX IF NOT EXISTS idx_series_school ON series(school_id);

-- 4. Évolution de la table classes
-- Ajout des clés étrangères vers la nouvelle structure
-- SQLite permet l'ajout de colonnes avec REFERENCES
ALTER TABLE classes ADD COLUMN level_id TEXT REFERENCES levels(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN series_id TEXT REFERENCES series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classes_level ON classes(level_id);
CREATE INDEX IF NOT EXISTS idx_classes_series ON classes(series_id);

-- 5. Évolution de la table class_subjects (Affectation Pédagogique)
-- Ajout des propriétés avancées de Nia
ALTER TABLE class_subjects ADD COLUMN weekly_hours REAL;
ALTER TABLE class_subjects ADD COLUMN subject_type TEXT; -- ex: 'principal', 'facultatif'
ALTER TABLE class_subjects ADD COLUMN is_mandatory INTEGER DEFAULT 1;
ALTER TABLE class_subjects ADD COLUMN order_index INTEGER DEFAULT 0;
ALTER TABLE class_subjects ADD COLUMN color_icon TEXT;
