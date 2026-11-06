-- ============================================================
-- SEC05 — Tests de public.check_user_has_role — vérification du profil actif
-- ============================================================
-- À exécuter sur une base Supabase de TEST (jamais en production),
-- après application de la migration 20261104000000_sec05_check_user_has_role_profile_check.sql.
--
-- Le script crée ses fixtures puis termine par ROLLBACK.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. FIXTURES
-- ============================================================

-- Deux écoles distinctes pour tester l'isolation par établissement
INSERT INTO public.schools (id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'École Alpha'),
  ('22222222-2222-4222-8222-222222222222', 'École Bêta')
ON CONFLICT (id) DO NOTHING;

-- Rôles de base (déjà présents dans 01_init.sql, mais on s'assure)
INSERT INTO public.roles (id, name) VALUES
  ('role_dir', 'DIRECTION'),
  ('role_sec', 'SECRETAIRE'),
  ('role_prof', 'PROFESSEUR')
ON CONFLICT (id) DO NOTHING;

-- Utilisateurs de test
INSERT INTO public.users (id, email, status) VALUES
  ('u-active-1', 'active@test.com', 'ACTIVE'),        -- profil actif, rôle DIRECTION
  ('u-active-2', 'active2@test.com', 'ACTIVE'),       -- profil actif, rôle COMPTABLE
  ('u-softdel-1', 'softdel@test.com', 'ACTIVE'),      -- profil SOFT-DELETÉ, rôle DIRECTION
  ('u-noprofile-1', 'noprofile@test.com', 'ACTIVE'),  -- AUCUN profil, rôle persistant
  ('u-wrongschool-1', 'wrongschool@test.com', 'ACTIVE'), -- profil actif, école différente
  ('u-inactive-1', 'inactive@test.com', 'INACTIVE')   -- compte désactivé, rôle persistant
ON CONFLICT (id) DO NOTHING;

-- Profils
INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('p-active-1', 'u-active-1', '11111111-1111-4111-8111-111111111111', 'Active', 'One', NULL),           -- actif, école Alpha
  ('p-active-2', 'u-active-2', '11111111-1111-4111-8111-111111111111', 'Active', 'Two', NULL),           -- actif, école Alpha
  ('p-softdel-1', 'u-softdel-1', '11111111-1111-4111-8111-111111111111', 'Soft', 'Deleted', NOW()),      -- SOFT-DELETÉ, école Alpha
  ('p-wrongschool-1', 'u-wrongschool-1', '22222222-2222-4222-8222-222222222222', 'Wrong', 'School', NULL), -- actif, école Bêta
  ('p-inactive-1', 'u-inactive-1', '11111111-1111-4111-8111-111111111111', 'Inactive', 'One', NULL)      -- actif, école Alpha (mais compte désactivé)
ON CONFLICT (id) DO NOTHING;

-- Rôles (user_roles)
INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('ur-active-1-dir', 'u-active-1', '11111111-1111-4111-8111-111111111111', 'role_dir'),   -- DIRECTION, école Alpha, profil actif
  ('ur-active-2-compt', 'u-active-2', '11111111-1111-4111-8111-111111111111', 'role_sec'),   -- COMPTABLE, école Alpha, profil actif
  ('ur-softdel-1-dir', 'u-softdel-1', '11111111-1111-4111-8111-111111111111', 'role_dir'),   -- DIRECTION, école Alpha, profil SOFT-DELETÉ
  ('ur-noprofile-1-dir', 'u-noprofile-1', '11111111-1111-4111-8111-111111111111', 'role_dir'), -- DIRECTION, école Alpha, AUCUN profil
  ('ur-wrongschool-1-dir', 'u-wrongschool-1', '22222222-2222-4222-8222-222222222222', 'role_dir'), -- DIRECTION, école Bêta, profil actif école Bêta
  ('ur-inactive-1-dir', 'u-inactive-1', '11111111-1111-4111-8111-111111111111', 'role_dir')    -- DIRECTION, école Alpha, compte INACTIVE
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. TESTS
-- ============================================================

-- Helper pour définir l'utilisateur courant via le JWT claim sub
-- (simule auth.uid() dans les fonctions SECURITY DEFINER)

-- --- Test 1 : Profil actif + rôle DIRECTION → accès autorisé ---
SELECT set_config('request.jwt.claim.sub', 'u-active-1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role(
    '11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]
  ) INTO v_result;
  IF NOT v_result THEN
    RAISE EXCEPTION 'TEST 1 ÉCHEC : Profil actif + DIRECTION devrait être autorisé';
  END IF;
  RAISE NOTICE 'OK 1/7 — Profil actif + rôle DIRECTION : accès autorisé';
END $$;

-- --- Test 2 : Profil actif + rôle COMPTABLE → accès autorisé ---
SELECT set_config('request.jwt.claim.sub', 'u-active-2', true);

DO $$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role(
    '11111111-1111-4111-8111-111111111111', ARRAY['COMPTABLE']::text[]
  ) INTO v_result;
  IF NOT v_result THEN
    RAISE EXCEPTION 'TEST 2 ÉCHEC : Profil actif + COMPTABLE devrait être autorisé';
  END IF;
  RAISE NOTICE 'OK 2/7 — Profil actif + rôle COMPTABLE : accès autorisé';
END $$;

-- --- Test 3 : Profil soft-deleté + rôle DIRECTION → accès refusé ---
SELECT set_config('request.jwt.claim.sub', 'u-softdel-1', true);

DO $$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role(
    '11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]
  ) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 3 ÉCHEC : Profil soft-deleté + DIRECTION devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 3/7 — Profil soft-deleté + rôle DIRECTION : accès refusé';
END $$;

-- --- Test 4 : Profil absent + rôle persistant → accès refusé ---
SELECT set_config('request.jwt.claim.sub', 'u-noprofile-1', true);

DO $$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role(
    '11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]
  ) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 4 ÉCHEC : Aucun profil + DIRECTION devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 4/7 — Aucun profil + rôle DIRECTION : accès refusé';
END $$;

-- --- Test 5 : Profil actif dans un autre établissement → accès refusé ---
SELECT set_config('request.jwt.claim.sub', 'u-wrongschool-1', true);

DO $$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role(
    '11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]
  ) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 5 ÉCHEC : Profil actif école Bêta + accès école Alpha devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 5/7 — Profil actif dans autre établissement : accès refusé';
END $$;

-- --- Test 6 : Compte désactivé → accès refusé ---
SELECT set_config('request.jwt.claim.sub', 'u-inactive-1', true);

DO $$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role(
    '11111111-1111-4111-8111-111111111111', ARRAY['DIRECTION']::text[]
  ) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 6 ÉCHEC : Compte désactivé + DIRECTION devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 6/7 — Compte désactivé : accès refusé';
END $$;

-- --- Test 7 : Utilisateur sans rôle requis → accès refusé ---
-- u-active-1 a le rôle DIRECTION mais on demande COMPTABLE
SELECT set_config('request.jwt.claim.sub', 'u-active-1', true);

DO $$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.check_user_has_role(
    '11111111-1111-4111-8111-111111111111', ARRAY['COMPTABLE']::text[]
  ) INTO v_result;
  IF v_result THEN
    RAISE EXCEPTION 'TEST 7 ÉCHEC : Rôle DIRECTION + demande COMPTABLE devrait être refusé';
  END IF;
  RAISE NOTICE 'OK 7/7 — Rôle non requis : accès refusé';
END $$;


-- ============================================================
-- 3. VÉRIFICATION DES POLITIQUES RLS EXISTANTES
-- ============================================================
-- Confirmer que les 8 politiques RLS utilisent toujours
-- public.check_user_has_role sans modification.

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('fee_structures', 'payments')
    AND (qual LIKE '%check_user_has_role%' OR with_check LIKE '%check_user_has_role%');
  IF v_count <> 8 THEN
    RAISE WARNING 'ATTENTION : % politique(s) RLS utilisant check_user_has_role trouvées (attendu 8)', v_count;
  ELSE
    RAISE NOTICE 'OK — 8 politiques RLS utilisent check_user_has_role (inchangées)';
  END IF;
END $$;

-- ============================================================
-- ROLLBACK (ne pas valider les fixtures de test)
-- ============================================================
ROLLBACK;

SELECT 'Tous les tests sec05_check_user_has_role_profile_test.sql sont terminés.' AS status;