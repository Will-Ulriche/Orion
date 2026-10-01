-- Session 5 : Notes et Résultats (Academic Module)
-- Aligne le schéma distant sur les migrations locales (11_academic_module.sql)
-- (Toutes les clés et références utilisent le type TEXT pour correspondre au schéma actuel de la table schools et au SQLite local)

-- 1. Catalogue des matières
CREATE TABLE IF NOT EXISTS public.subjects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Types d'évaluation
CREATE TABLE IF NOT EXISTS public.grade_types (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    max_score REAL NOT NULL DEFAULT 20.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Périodes d'évaluation
CREATE TABLE IF NOT EXISTS public.grading_periods (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    academic_year_id TEXT NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    period_order INTEGER NOT NULL,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Affectation d'une matière à une classe (class_subjects)
CREATE TABLE IF NOT EXISTS public.class_subjects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    academic_year_id TEXT NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    teacher_id TEXT,
    coefficient REAL NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (academic_year_id, class_id, subject_id)
);

-- 5. Attribution des professeurs (teacher_assignments)
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    academic_year_id TEXT NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL,
    class_subject_id TEXT NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (academic_year_id, teacher_id, class_subject_id)
);

-- 6. Notes des élèves (grades)
CREATE TABLE IF NOT EXISTS public.grades (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    academic_year_id TEXT NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    enrollment_id TEXT NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_subject_id TEXT NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
    grading_period_id TEXT NOT NULL REFERENCES public.grading_periods(id) ON DELETE CASCADE,
    grade_type_id TEXT NOT NULL REFERENCES public.grade_types(id) ON DELETE CASCADE,
    score REAL NOT NULL,
    max_score REAL NOT NULL DEFAULT 20.0,
    evaluation_date DATE,
    notes TEXT,
    recorded_by TEXT NOT NULL,
    is_absent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les performances (grades)
CREATE INDEX IF NOT EXISTS idx_grades_enrollment ON public.grades(school_id, academic_year_id, enrollment_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON public.grades(school_id, academic_year_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grades_class_subject ON public.grades(class_subject_id, grading_period_id);
CREATE INDEX IF NOT EXISTS idx_grades_period ON public.grades(grading_period_id);

-- 7. Sécurité (RLS)
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- 8. Fonction et Triggers updated_at (Nécessaires pour la synchronisation)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subjects_updated_at ON public.subjects;
CREATE TRIGGER trg_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_grade_types_updated_at ON public.grade_types;
CREATE TRIGGER trg_grade_types_updated_at
  BEFORE UPDATE ON public.grade_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_grading_periods_updated_at ON public.grading_periods;
CREATE TRIGGER trg_grading_periods_updated_at
  BEFORE UPDATE ON public.grading_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_class_subjects_updated_at ON public.class_subjects;
CREATE TRIGGER trg_class_subjects_updated_at
  BEFORE UPDATE ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_teacher_assignments_updated_at ON public.teacher_assignments;
CREATE TRIGGER trg_teacher_assignments_updated_at
  BEFORE UPDATE ON public.teacher_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_grades_updated_at ON public.grades;
CREATE TRIGGER trg_grades_updated_at
  BEFORE UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
