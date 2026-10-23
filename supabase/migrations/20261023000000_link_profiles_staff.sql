-- ============================================================
-- Migration : lien entre les profils utilisateurs et le personnel
-- ============================================================
-- `public.staff.id` et `public.profiles.id` sont des TEXT dans le schéma
-- distant : `staff_id` est donc un TEXT nullable, sans contrainte FK
-- (le module personnel n'est pas encore synchronisé côté cloud).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS staff_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_staff ON public.profiles(staff_id);
