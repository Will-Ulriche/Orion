-- ============================================================
-- Migration 25 : Lien entre les comptes utilisateurs et le personnel
-- ============================================================
-- Un profil utilisateur peut être rattaché à une fiche du personnel
-- (table `staff`). Ce lien est la source de vérité pour retrouver le
-- membre du personnel correspondant au compte connecté.
ALTER TABLE profiles ADD COLUMN staff_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_staff ON profiles(staff_id);

CREATE INDEX IF NOT EXISTS idx_profiles_user_school ON profiles(user_id, school_id);
