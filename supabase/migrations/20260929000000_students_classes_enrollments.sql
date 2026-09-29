-- Session 2 : élèves, classes et refonte des inscriptions
-- Aligne le schéma distant sur les migrations locales
-- (04_session2_academic_years.sql + 06_student_details.sql + 07_student_birth_place.sql)

-- 1. Élèves
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date DATE,
    birth_place TEXT,
    gender TEXT,
    photo_url TEXT,
    matricule TEXT,
    address TEXT,
    phone TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    blood_type TEXT,
    medical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Classes
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    level TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Refonte des inscriptions (l'ancienne version portait sur des utilisateurs)
DROP TABLE IF EXISTS public.enrollment_history;
DROP TABLE IF EXISTS public.enrollments;

CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    enrollment_number TEXT,
    enrollment_date DATE,
    status TEXT DEFAULT 'ACTIVE',
    enrollment_type TEXT NOT NULL,
    previous_class_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Un élève ne peut être inscrit qu'une seule fois dans une année scolaire
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_yearly_enrollment
    ON public.enrollments(academic_year_id, student_id);

-- 4. Historique des inscriptions
CREATE TABLE public.enrollment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    from_class_id UUID,
    to_class_id UUID,
    reason TEXT NOT NULL,
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Intégrité : une seule année active / planifiée / courante par établissement
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_year
    ON public.academic_years(school_id) WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_planned_year
    ON public.academic_years(school_id) WHERE status = 'PLANNED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_current_year
    ON public.academic_years(school_id) WHERE is_current = true;

-- 6. Sécurité
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_history ENABLE ROW LEVEL SECURITY;
