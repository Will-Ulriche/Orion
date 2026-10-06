-- ============================================================
-- Migration 16 — Emploi du temps (Timetable)
-- ============================================================

CREATE TABLE IF NOT EXISTS timetable_slots (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,   -- 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi
    slot_index INTEGER NOT NULL,    -- Index du créneau horaire (0-based)
    subject_id TEXT,                -- Nullable si case vide
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    UNIQUE (academic_year_id, class_id, day_of_week, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_timetable_class ON timetable_slots(school_id, academic_year_id, class_id);
