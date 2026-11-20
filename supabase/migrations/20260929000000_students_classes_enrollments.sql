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
DO $$
BEGIN
    IF to_regclass('public.enrollments_legacy_v1') IS NOT NULL THEN
        RETURN;
    END IF;

    IF to_regclass('public.enrollments') IS NULL OR to_regclass('public.enrollment_history') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE public.enrollment_history RENAME TO enrollment_history_legacy_v1;
    ALTER TABLE public.enrollments RENAME TO enrollments_legacy_v1;

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
        legacy_user_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE public.enrollment_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
        student_id UUID NOT NULL,
        academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
        from_class_id UUID,
        to_class_id UUID,
        reason TEXT NOT NULL,
        changed_by UUID,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        legacy_enrollment_id UUID,
        legacy_status TEXT,
        legacy_notes TEXT
    );

    INSERT INTO public.students (id, school_id, first_name, last_name, created_at)
    SELECT p.user_id,
           p.school_id,
           COALESCE(NULLIF(p.first_name, ''), 'Élève'),
           COALESCE(NULLIF(p.last_name, ''), 'Legacy'),
           p.created_at
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM public.enrollments_legacy_v1 e WHERE e.user_id = p.user_id)
      AND p.id = (
          SELECT p2.id
          FROM public.profiles p2
          JOIN public.enrollments_legacy_v1 e2
            ON e2.user_id = p2.user_id AND e2.school_id = p2.school_id
          WHERE p2.user_id = p.user_id
          ORDER BY p2.id
          LIMIT 1
      )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.students (id, school_id, first_name, last_name, created_at)
    SELECT u.id,
           COALESCE(
               (SELECT e.school_id FROM public.enrollments_legacy_v1 e WHERE e.user_id = u.id ORDER BY e.id LIMIT 1),
               (SELECT p.school_id FROM public.profiles p WHERE p.user_id = u.id ORDER BY p.id LIMIT 1)
           ),
           COALESCE(NULLIF(split_part(u.email, '@', 1), ''), 'Élève'),
           'Legacy',
           u.created_at
    FROM public.users u
    WHERE EXISTS (SELECT 1 FROM public.enrollments_legacy_v1 e WHERE e.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = u.id)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.students (id, school_id, first_name, last_name, created_at)
    SELECT e.user_id,
           e.school_id,
           'Élève',
           'Legacy',
           e.created_at
    FROM public.enrollments_legacy_v1 e
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = e.user_id)
      AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = e.user_id)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.enrollments (
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
    FROM public.enrollments_legacy_v1 e
    WHERE e.id = (
        SELECT e2.id
        FROM public.enrollments_legacy_v1 e2
        WHERE e2.academic_year_id = e.academic_year_id AND e2.user_id = e.user_id
        ORDER BY e2.id
        LIMIT 1
    );

    WITH normalized AS (
        SELECT h.id,
               h.status,
               h.notes,
               h.created_by,
               h.created_at,
               h.enrollment_id AS legacy_enrollment_id,
               COALESCE(
                   (SELECT e.id FROM public.enrollments e WHERE e.id = h.enrollment_id),
                   (SELECT canon.id
                    FROM public.enrollments_legacy_v1 dup
                    JOIN public.enrollments canon
                      ON canon.academic_year_id = dup.academic_year_id
                     AND canon.student_id = dup.user_id
                    WHERE dup.id = h.enrollment_id
                    LIMIT 1)
               ) AS enrollment_id
        FROM public.enrollment_history_legacy_v1 h
    )
    INSERT INTO public.enrollment_history (
        id, enrollment_id, student_id, academic_year_id,
        from_class_id, to_class_id, reason, changed_by, changed_at,
        legacy_enrollment_id, legacy_status, legacy_notes
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
    JOIN public.enrollments e ON e.id = n.enrollment_id;
END $$;

-- Un élève ne peut être inscrit qu'une seule fois dans une année scolaire
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_yearly_enrollment
    ON public.enrollments(academic_year_id, student_id);

-- 4. Historique des inscriptions
DO $$
BEGIN
    IF to_regclass('public.enrollment_history') IS NOT NULL THEN
        RETURN;
    END IF;

    CREATE TABLE public.enrollment_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
        student_id UUID NOT NULL,
        academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
        from_class_id UUID,
        to_class_id UUID,
        reason TEXT NOT NULL,
        changed_by UUID,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        legacy_enrollment_id UUID,
        legacy_status TEXT,
        legacy_notes TEXT
    );
END $$;

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
