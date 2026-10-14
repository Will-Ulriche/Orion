-- ============================================================
-- Suppression définitive et robuste d'un établissement
-- ------------------------------------------------------------
-- Certaines clés étrangères pointant vers public.schools ont été
-- créées SANS « ON DELETE CASCADE » en base (ex. classes_school_id_fkey),
-- ce qui bloque la suppression d'un établissement par simple
-- « DELETE FROM schools ».
--
-- On supprime donc explicitement toutes les tables filles, de la plus
-- profonde vers la plus proche de schools, puis l'établissement.
-- La fonction est insensible :
--   • aux types de colonnes (comparaisons en ::text, uuid/text),
--   • aux tables/colonnes absentes (schéma partiel) : elles sont ignorées.
-- ============================================================

DROP FUNCTION IF EXISTS public.delete_school_cascade(uuid);
DROP FUNCTION IF EXISTS public.delete_school_cascade(text);

CREATE OR REPLACE FUNCTION public.delete_school_cascade(p_school_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'grades',
        'teacher_assignments',
        'class_subjects',
        'grading_periods',
        'grade_types',
        'subjects',
        'enrollment_history',   -- pas de school_id : rattaché via inscription/année
        'enrollments',
        'classes',
        'students',
        'academic_years',
        'audit_logs',
        'devices',
        'licenses',
        'user_roles',
        'profiles'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        BEGIN
            IF t = 'enrollment_history' THEN
                EXECUTE
                    'DELETE FROM public.enrollment_history
                      WHERE enrollment_id::text IN (
                                SELECT id::text FROM public.enrollments
                                WHERE school_id::text = $1
                            )
                         OR academic_year_id::text IN (
                                SELECT id::text FROM public.academic_years
                                WHERE school_id::text = $1
                            )'
                    USING p_school_id;
            ELSE
                EXECUTE format('DELETE FROM public.%I WHERE school_id::text = $1', t)
                    USING p_school_id;
            END IF;
        EXCEPTION
            WHEN undefined_table  THEN NULL;  -- table absente : ignorer
            WHEN undefined_column THEN NULL;  -- pas de colonne school_id : ignorer
        END;
    END LOOP;

    -- L'établissement lui-même.
    DELETE FROM public.schools WHERE id::text = p_school_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_school_cascade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_school_cascade(text) TO authenticated, service_role;
