-- 1. Index partiels sur academic_years pour l'intégrité
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_year 
ON academic_years(school_id) 
WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_planned_year 
ON academic_years(school_id) 
WHERE status = 'PLANNED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_current_year 
ON academic_years(school_id) 
WHERE is_current = 1;

-- 2. Création de la table des élèves
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date DATE,
    gender TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id)
);

-- 3. Création de la table des classes
CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    name TEXT NOT NULL,
    level TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
);

-- 4. Refonte de enrollments (suppression de l'ancienne version)
DROP TABLE IF EXISTS enrollment_history;
DROP TABLE IF EXISTS enrollments;

CREATE TABLE enrollments (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    class_id TEXT,
    enrollment_number TEXT,
    enrollment_date DATE,
    status TEXT DEFAULT 'ACTIVE',
    enrollment_type TEXT NOT NULL,
    previous_class_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (class_id) REFERENCES classes(id)
);

CREATE UNIQUE INDEX idx_student_yearly_enrollment 
ON enrollments(academic_year_id, student_id);

CREATE TABLE enrollment_history (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    from_class_id TEXT,
    to_class_id TEXT,
    reason TEXT NOT NULL,
    changed_by TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
);
