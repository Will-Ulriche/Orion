-- ============================================================
-- ORI-SEC-04 : Restructuration des politiques RLS permissives
-- ------------------------------------------------------------
-- Vulnérabilités confirmées sur la base distante :
--
--   A. FUITE PUBLIQUE (anon) :
--      - fee_structures : 33 lignes lisibles sans authentification
--      - payments       : 3 478 lignes lisibles sans authentification
--
--   B. FUITE INTER-ÉTABLISSEMENT (cross-school) :
--      - Un utilisateur DIRECTION d'Agora peut lire ET modifier
--        les fee_structures et payments de Saint-Louis.
--
--   C. ESCALADE DE RÔLE :
--      - Un PROFESSEUR ou SECRETAIRE peut lire, modifier et
--        supprimer les tables financières de son établissement.
--
-- Cause racine :
--   La fonction distante my_school_ids() retourne la valeur
--   littérale 'school-1' (jamais un UUID réel). La condition
--   school_id IN (SELECT my_school_ids()) est donc sans effet.
--   De plus, aucun REVOKE n'empêchait l'accès du rôle anon.
--
-- Correction :
--   1. REVOKE SELECT sur fee_structures et payments pour anon.
--   2. Suppression des politiques FOR ALL permissives.
--   3. Création d'une fonction helper check_user_has_role()
--      qui interroge directement user_roles et roles, sans
--      dépendre de my_school_ids() ou de profiles.
--   4. Politiques granulaires SELECT/INSERT/UPDATE/DELETE
--      limitées aux rôles DIRECTION et COMPTABLE (ou SUPER_ADMIN),
--      avec isolation par school_id vérifiée en base.
-- ============================================================

-- ============================================================
-- ÉTAPE 0 : Révocation des droits publics sur les tables
-- ============================================================
REVOKE ALL ON TABLE public.fee_structures FROM anon;
REVOKE ALL ON TABLE public.payments FROM anon;

-- Conservation des droits minimaux pour le rôle service_role
-- (utilisé par les scripts d'administration et de seed)
GRANT ALL ON TABLE public.fee_structures TO service_role;
GRANT ALL ON TABLE public.payments TO service_role;

-- Le rôle authenticated conserve ses droits de table ;
-- l'accès effectif est contrôlé exclusivement par les policies RLS ci-dessous.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fee_structures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payments TO authenticated;


-- ============================================================
-- ÉTAPE 1 : Fonction helper — vérification de rôle par school_id
-- ============================================================
-- Ne dépend pas de my_school_ids() ni de profiles.
-- Interroge directement user_roles et roles (tables fiables côté serveur).
-- SECURITY DEFINER + search_path figé pour éviter l'injection de schéma.
CREATE OR REPLACE FUNCTION public.check_user_has_role(
  p_school_id text,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id::text = auth.uid()::text
      AND ur.school_id::text = p_school_id
      AND r.name = ANY (p_roles)
      AND NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = ur.user_id AND u.status <> 'ACTIVE'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.check_user_has_role(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_user_has_role(text, text[]) TO authenticated, service_role;


-- ============================================================
-- ÉTAPE 2 : Sécurisation de la table fee_structures
-- ============================================================
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;

-- Suppression de toutes les politiques existantes (permissives)
DROP POLICY IF EXISTS fee_structures_school_scope ON public.fee_structures;
DROP POLICY IF EXISTS fee_structures_select       ON public.fee_structures;
DROP POLICY IF EXISTS fee_structures_insert       ON public.fee_structures;
DROP POLICY IF EXISTS fee_structures_update       ON public.fee_structures;
DROP POLICY IF EXISTS fee_structures_delete       ON public.fee_structures;
-- Politique générique issue de ori_sec_007 (si appliquée)
DROP POLICY IF EXISTS "fee_structures_read"       ON public.fee_structures;
DROP POLICY IF EXISTS "fee_structures_write"      ON public.fee_structures;

-- SELECT : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY fee_structures_select ON public.fee_structures
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );

-- INSERT : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY fee_structures_insert ON public.fee_structures
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );

-- UPDATE : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY fee_structures_update ON public.fee_structures
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );

-- DELETE : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY fee_structures_delete ON public.fee_structures
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );


-- ============================================================
-- ÉTAPE 3 : Sécurisation de la table payments
-- ============================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Suppression de toutes les politiques existantes (permissives)
DROP POLICY IF EXISTS payments_school_scope ON public.payments;
DROP POLICY IF EXISTS payments_select       ON public.payments;
DROP POLICY IF EXISTS payments_insert       ON public.payments;
DROP POLICY IF EXISTS payments_update       ON public.payments;
DROP POLICY IF EXISTS payments_delete       ON public.payments;
-- Politique générique issue de ori_sec_007 (si appliquée)
DROP POLICY IF EXISTS "payments_read"       ON public.payments;
DROP POLICY IF EXISTS "payments_write"      ON public.payments;

-- SELECT : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );

-- INSERT : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );

-- UPDATE : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );

-- DELETE : DIRECTION, COMPTABLE ou SUPER_ADMIN sur leur établissement uniquement
CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR public.check_user_has_role(school_id::text, ARRAY['DIRECTION', 'COMPTABLE']::text[])
  );
