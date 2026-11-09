-- ============================================================
-- Migration: 20261108000000_pedagogical_structure.sql
-- Description: Structure pédagogique avancée distante (Sections -> Niveaux -> Séries)
-- Aligne le schéma Supabase sur la migration locale 13_pedagogical_structure.sql
-- et les spécifications de sécurité ORI-SEC-007.
-- ============================================================

-- 1. Table sections (Maternelle, Primaire, Collège, Lycée, etc.)
CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sections_school ON public.sections(school_id, name);

-- 2. Table levels (ex: 6ème, 5ème, Seconde, Terminale)
CREATE TABLE IF NOT EXISTS public.levels (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    level_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_levels_school ON public.levels(school_id, section_id);
CREATE INDEX IF NOT EXISTS idx_levels_section ON public.levels(section_id);

-- 3. Table series (ex: Scientifique, Littéraire, Séries A, C, D)
CREATE TABLE IF NOT EXISTS public.series (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_series_school ON public.series(school_id, level_id);
CREATE INDEX IF NOT EXISTS idx_series_level ON public.series(level_id);

-- 4. Évolution de la table classes (liens optionnels vers niveau et série)
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS level_id UUID REFERENCES public.levels(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.series(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classes_level ON public.classes(level_id);
CREATE INDEX IF NOT EXISTS idx_classes_series ON public.classes(series_id);

-- 5. Privilèges de tables (conforme ORI-SEC-007)
REVOKE ALL ON TABLE public.sections FROM anon;
REVOKE ALL ON TABLE public.levels FROM anon;
REVOKE ALL ON TABLE public.series FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.levels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.series TO authenticated;

GRANT ALL ON TABLE public.sections TO service_role;
GRANT ALL ON TABLE public.levels TO service_role;
GRANT ALL ON TABLE public.series TO service_role;

-- 6. Triggers automatiques de mise à jour updated_at (utilise public.set_updated_at())
DROP TRIGGER IF EXISTS trg_sections_updated_at ON public.sections;
CREATE TRIGGER trg_sections_updated_at
    BEFORE UPDATE ON public.sections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_levels_updated_at ON public.levels;
CREATE TRIGGER trg_levels_updated_at
    BEFORE UPDATE ON public.levels
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_series_updated_at ON public.series;
CREATE TRIGGER trg_series_updated_at
    BEFORE UPDATE ON public.series
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Sécurité et Politiques RLS (Row Level Security) - Conforme ORI-SEC-007
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

-- Politiques pour public.sections
DROP POLICY IF EXISTS sections_select ON public.sections;
CREATE POLICY sections_select ON public.sections
    FOR SELECT TO authenticated
    USING (public.is_super_admin() OR school_id::text IN (SELECT public.user_school_ids()));

DROP POLICY IF EXISTS sections_insert ON public.sections;
CREATE POLICY sections_insert ON public.sections
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

DROP POLICY IF EXISTS sections_update ON public.sections;
CREATE POLICY sections_update ON public.sections
    FOR UPDATE TO authenticated
    USING (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]))
    WITH CHECK (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

DROP POLICY IF EXISTS sections_delete ON public.sections;
CREATE POLICY sections_delete ON public.sections
    FOR DELETE TO authenticated
    USING (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

-- Politiques pour public.levels
DROP POLICY IF EXISTS levels_select ON public.levels;
CREATE POLICY levels_select ON public.levels
    FOR SELECT TO authenticated
    USING (public.is_super_admin() OR school_id::text IN (SELECT public.user_school_ids()));

DROP POLICY IF EXISTS levels_insert ON public.levels;
CREATE POLICY levels_insert ON public.levels
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

DROP POLICY IF EXISTS levels_update ON public.levels;
CREATE POLICY levels_update ON public.levels
    FOR UPDATE TO authenticated
    USING (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]))
    WITH CHECK (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

DROP POLICY IF EXISTS levels_delete ON public.levels;
CREATE POLICY levels_delete ON public.levels
    FOR DELETE TO authenticated
    USING (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

-- Politiques pour public.series
DROP POLICY IF EXISTS series_select ON public.series;
CREATE POLICY series_select ON public.series
    FOR SELECT TO authenticated
    USING (public.is_super_admin() OR school_id::text IN (SELECT public.user_school_ids()));

DROP POLICY IF EXISTS series_insert ON public.series;
CREATE POLICY series_insert ON public.series
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

DROP POLICY IF EXISTS series_update ON public.series;
CREATE POLICY series_update ON public.series
    FOR UPDATE TO authenticated
    USING (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]))
    WITH CHECK (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));

DROP POLICY IF EXISTS series_delete ON public.series;
CREATE POLICY series_delete ON public.series
    FOR DELETE TO authenticated
    USING (public.can_manage_school(school_id::text, ARRAY['DIRECTION', 'SECRETAIRE']::text[]));
