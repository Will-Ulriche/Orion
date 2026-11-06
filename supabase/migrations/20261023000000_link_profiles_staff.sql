-- ============================================================
-- Migration : lien entre les profils utilisateurs et le personnel
-- ============================================================
-- `public.profiles.id` et `public.staff.id` sont des UUID dans le schéma
-- distant Supabase : `staff_id` est de type UUID avec référence à public.staff(id).
-- Un profil utilisateur peut être rattaché à une fiche du personnel.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'staff_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_staff ON public.profiles(staff_id);
