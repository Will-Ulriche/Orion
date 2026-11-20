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

ALTER TABLE enrollment_history RENAME TO enrollment_history_legacy_v1;
ALTER TABLE enrollments RENAME TO enrollments_legacy_v1;

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
    legacy_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (class_id) REFERENCES classes(id)
);

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
    legacy_enrollment_id TEXT,
    legacy_status TEXT,
    legacy_notes TEXT,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
);

INSERT OR IGNORE INTO students (id, school_id, first_name, last_name, created_at)
SELECT p.user_id,
       p.school_id,
       COALESCE(NULLIF(p.first_name, ''), 'Élève'),
       COALESCE(NULLIF(p.last_name, ''), 'Legacy'),
       p.created_at
FROM profiles p
WHERE EXISTS (SELECT 1 FROM enrollments_legacy_v1 e WHERE e.user_id = p.user_id)
  AND p.id = (
      SELECT MIN(p2.id)
      FROM profiles p2
      JOIN enrollments_legacy_v1 e2 ON e2.user_id = p2.user_id AND e2.school_id = p2.school_id
      WHERE p2.user_id = p.user_id
  );

INSERT OR IGNORE INTO students (id, school_id, first_name, last_name, created_at)
SELECT u.id,
       (SELECT e.school_id FROM enrollments_legacy_v1 e WHERE e.user_id = u.id ORDER BY e.id LIMIT 1),
       COALESCE(NULLIF(u.email, ''), 'Élève'),
       'Legacy',
       u.created_at
FROM users u
WHERE EXISTS (SELECT 1 FROM enrollments_legacy_v1 e WHERE e.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = u.id);

INSERT OR IGNORE INTO students (id, school_id, first_name, last_name, created_at)
SELECT e.user_id,
       (SELECT e2.school_id FROM enrollments_legacy_v1 e2 WHERE e2.user_id = e.user_id ORDER BY e2.id LIMIT 1),
       'Élève',
       'Legacy',
       e.created_at
FROM enrollments_legacy_v1 e
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.user_id)
  AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = e.user_id);

INSERT INTO enrollments (
    id, school_id, academic_year_id, student_id, class_id,
    enrollment_number, enrollment_date, status, enrollment_type,
    previous_class_id, legacy_user_id, created_at, updated_at
)
SELECT e.id,
       e.school_id,
       e.academic_year_id,
       e.user_id,
       NULL,
       NULL,
       NULL,
       COALESCE(e.status, 'ACTIVE'),
       'LEGACY',
       NULL,
       e.user_id,
       e.created_at,
       e.updated_at
FROM enrollments_legacy_v1 e
WHERE e.id = (
    SELECT MIN(e2.id)
    FROM enrollments_legacy_v1 e2
    WHERE e2.academic_year_id = e.academic_year_id AND e2.user_id = e.user_id
);

INSERT INTO enrollment_history (
    id, enrollment_id, student_id, academic_year_id,
    from_class_id, to_class_id, reason, changed_by, changed_at,
    legacy_enrollment_id, legacy_status, legacy_notes
)
WITH normalized AS (
    SELECT h.id,
           h.status,
           h.notes,
           h.created_by,
           h.created_at,
           h.enrollment_id AS legacy_enrollment_id,
           COALESCE(
               (SELECT e.id FROM enrollments e WHERE e.id = h.enrollment_id),
               (SELECT canon.id
                FROM enrollments_legacy_v1 dup
                JOIN enrollments canon
                  ON canon.academic_year_id = dup.academic_year_id
                 AND canon.student_id = dup.user_id
                WHERE dup.id = h.enrollment_id)
           ) AS enrollment_id
    FROM enrollment_history_legacy_v1 h
)
SELECT n.id,
       n.enrollment_id,
       e.student_id,
       e.academic_year_id,
       NULL,
       NULL,
       COALESCE(NULLIF(n.notes, ''), 'LEGACY:' || COALESCE(n.status, '')),
       n.created_by,
       n.created_at,
       n.legacy_enrollment_id,
       n.status,
       n.notes
FROM normalized n
JOIN enrollments e ON e.id = n.enrollment_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_yearly_enrollment
ON enrollments(academic_year_id, student_id);
