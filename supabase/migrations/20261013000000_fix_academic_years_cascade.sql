-- ============================================================
-- Correction : ON DELETE CASCADE manquant sur academic_years
-- La table a été créée sans CASCADE effectif en base, ce qui
-- bloque la suppression d'un établissement.
-- Cette migration recrée la contrainte avec ON DELETE CASCADE.
-- ============================================================

ALTER TABLE public.academic_years
  DROP CONSTRAINT IF EXISTS academic_years_school_id_fkey;

ALTER TABLE public.academic_years
  ADD CONSTRAINT academic_years_school_id_fkey
  FOREIGN KEY (school_id)
  REFERENCES public.schools(id)
  ON DELETE CASCADE;
