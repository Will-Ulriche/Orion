-- ============================================================
-- Établissements — lecture par les membres de l'établissement
-- Jusqu'ici, seule la super-administration disposait d'une politique
-- RLS sur public.schools. Les comptes de direction ne pouvaient donc
-- pas lire les informations de leur propre établissement (elles
-- apparaissaient vides dans « Paramètres »).
-- Cette politique autorise chaque utilisateur authentifié à lire
-- l'établissement auquel il est rattaché (profil ou attribution de rôle).
--
-- Note : on caste en texte car le type de school_id peut différer
-- (uuid/text) selon les tables et le déploiement.
-- ============================================================

DROP POLICY IF EXISTS "schools_read_own" ON public.schools;
CREATE POLICY "schools_read_own" ON public.schools
    FOR SELECT
    USING (
        id::text IN (
            SELECT school_id::text FROM public.profiles
            WHERE user_id::text = auth.uid()::text
        )
        OR id::text IN (
            SELECT school_id::text FROM public.user_roles
            WHERE user_id::text = auth.uid()::text
        )
    );
