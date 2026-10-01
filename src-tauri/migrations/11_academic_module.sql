-- ============================================================
-- Session 5 — Module Pédagogique (Notes & Résultats)
-- ============================================================

-- Catalogue des matières de l'établissement
CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,       -- Abréviation ex: MATH, FR, SVT
    color TEXT,               -- Couleur optionnelle pour l'UI
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

-- ============================================================
-- Types d'évaluation (Contrôle, Examen, Devoir, Interro...)
-- Définis par école, réutilisables sur toutes les années
-- ============================================================
CREATE TABLE IF NOT EXISTS grade_types (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    name TEXT NOT NULL,       -- Ex: "Contrôle", "Examen", "Devoir"
    weight REAL NOT NULL DEFAULT 1.0, -- Poids dans la moyenne de la matière
    max_score REAL NOT NULL DEFAULT 20.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

CREATE INDEX IF NOT EXISTS idx_grade_types_school ON grade_types(school_id);

-- ============================================================
-- Périodes d'évaluation (Trimestres ou Semestres)
-- ============================================================
CREATE TABLE IF NOT EXISTS grading_periods (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    name TEXT NOT NULL,           -- Ex: "Trimestre 1", "Semestre 2"
    period_order INTEGER NOT NULL, -- Ordre d'affichage : 1, 2, 3
    start_date TEXT,
    end_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 0, -- 1 = période en cours de saisie
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
);

CREATE INDEX IF NOT EXISTS idx_grading_periods_year ON grading_periods(school_id, academic_year_id);

-- ============================================================
-- Affectation d'une matière à une classe pour une année donnée
-- avec coefficient et professeur responsable
-- ============================================================
CREATE TABLE IF NOT EXISTS class_subjects (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    teacher_id TEXT,              -- Nullable : peut être attribué plus tard
    coefficient REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE (academic_year_id, class_id, subject_id) -- Unicité par année/classe/matière
);

CREATE INDEX IF NOT EXISTS idx_class_subjects_year ON class_subjects(school_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON class_subjects(academic_year_id, class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(teacher_id);

-- ============================================================
-- Attribution explicite des professeurs à leurs matières/classes
-- (permet la gestion multi-professeur sur la même matière si besoin)
-- ============================================================
CREATE TABLE IF NOT EXISTS teacher_assignments (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,     -- Référence à users.id
    class_subject_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id),
    UNIQUE (academic_year_id, teacher_id, class_subject_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_year ON teacher_assignments(school_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments(teacher_id, academic_year_id);

-- ============================================================
-- Notes des élèves
-- Toujours liées à enrollment_id (inscription annuelle), jamais à student_id seul.
-- student_id est redondant mais accélère les requêtes par élève.
-- Les montants sont des REAL (virgule autorisée : 14.5/20).
-- is_absent = 1 signifie que l'élève était absent (score forcé à 0).
-- ============================================================
CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    enrollment_id TEXT NOT NULL,   -- Inscription annuelle de l'élève
    student_id TEXT NOT NULL,      -- Redondant pour accélérer les filtres par élève
    class_subject_id TEXT NOT NULL, -- Matière x Classe x Année
    grading_period_id TEXT NOT NULL,
    grade_type_id TEXT NOT NULL,
    score REAL NOT NULL,           -- Note obtenue (ex: 14.5)
    max_score REAL NOT NULL DEFAULT 20.0,
    evaluation_date TEXT,
    notes TEXT,                    -- Observations du professeur
    recorded_by TEXT NOT NULL,     -- user_id ayant saisi la note
    is_absent INTEGER NOT NULL DEFAULT 0, -- 1 si absent (score = 0)
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (class_subject_id) REFERENCES class_subjects(id),
    FOREIGN KEY (grading_period_id) REFERENCES grading_periods(id),
    FOREIGN KEY (grade_type_id) REFERENCES grade_types(id)
);

-- Index principaux pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_grades_enrollment ON grades(school_id, academic_year_id, enrollment_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(school_id, academic_year_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_class_subject ON grades(class_subject_id, grading_period_id);
CREATE INDEX IF NOT EXISTS idx_grades_period ON grades(grading_period_id);
