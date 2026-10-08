-- Index de performance : les listes (Archives, Classes, Élèves) filtrent
-- systématiquement par établissement + année, et le compteur d'élèves de
-- get_classes interroge enrollments par classe.
CREATE INDEX IF NOT EXISTS idx_enrollments_school_year ON enrollments(school_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_school_year ON classes(school_id, academic_year_id);
