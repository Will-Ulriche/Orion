-- ============================================================
-- SEC06 — Tests des politiques RLS sur fee_structures et payments
-- Vérification que le profil actif est requis pour accéder aux données
-- financières, conformément à la correction de check_user_has_role.
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

-- Rôles de base (déjà présents, mais on s'assure)
INSERT INTO public.roles (id, name) VALUES
  ('role_dir', 'DIRECTION'),
  ('role_sec', 'SECRETAIRE'),
  ('role_prof', 'PROFESSEUR')
ON CONFLICT (id) DO NOTHING;

-- Utilisateurs de test
INSERT INTO public.users (id, email, status) VALUES
  ('u-active-1', 'active@test.com', 'ACTIVE'),        -- profil actif, rôle DIRECTION
  ('u-softdel-1', 'softdel@test.com', 'ACTIVE'),      -- profil SOFT-DELETÉ, rôle DIRECTION
  ('u-noprofile-1', 'noprofile@test.com', 'ACTIVE'),  -- AUCUN profil, rôle DIRECTION persistant
  ('u-wrongschool-1', 'wrongschool@test.com', 'ACTIVE'), -- profil actif, école Bêta, rôle DIRECTION
  ('u-inactive-1', 'inactive@test.com', 'INACTIVE'),  -- compte désactivé, rôle persistant
  ('u-no-role-1', 'norole@test.com', 'ACTIVE')        -- profil actif, AUCUN rôle DIRECTION/COMPTABLE
ON CONFLICT (id) DO NOTHING;

-- Profils
INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('p-active-1', 'u-active-1', '11111111-1111-4111-8111-111111111111', 'Active', 'One', NULL),           -- actif, école Alpha
  ('p-active-2', 'u-active-2', '11111111-1111-4111-8111-111111111111', 'Active', 'Two', NULL),           -- actif, école Alpha (pas de rôle)
  ('p-softdel-1', 'u-softdel-1', '11111111-1111-4111-8111-111111111111', 'Soft', 'Deleted', NOW()),      -- SOFT-DELETÉ, école Alpha
  ('p-wrongschool-1', 'u-wrongschool-1', '22222222-2222-4222-8222-222222222222', 'Wrong', 'School', NULL), -- actif, école Bêta
  ('p-inactive-1', 'u-inactive-1', '11111111-1111-4111-8111-111111111111', 'Inactive', 'One', NULL),     -- actif, école Alpha (mais compte INACTIVE)
  ('p-no-role-1', 'u-no-role-1', '11111111-1111-4111-8111-111111111111', 'NoRole', 'One', NULL)          -- actif, école Alpha, aucun rôle financier
ON CONFLICT (id) DO NOTHING;

-- Rôles (user_roles)
INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('ur-active-1-dir', 'u-active-1', '11111111-1111-4111-8111-111111111111', 'role_dir'),   -- DIRECTION, école Alpha, profil actif
  ('ur-active-2-norole', 'u-active-2', '11111111-1111-4111-8111-111111111111', 'role_prof'),   -- PROFESSEUR, école Alpha, profil actif (pas DIRECTION/COMPTABLE)
  ('ur-softdel-1-dir', 'u-softdel-1', '11111111-1111-4111-8111-111111111111', 'role_dir'),   -- DIRECTION, école Alpha, profil SOFT-DELETÉ
  ('ur-noprofile-1-dir', 'u-noprofile-1', '11111111-1111-4111-8111-111111111111', 'role_dir'), -- DIRECTION, école Alpha, AUCUN profil

-- ============================================================
-- 2. TESTS SCÉNARIO A : Profil soft-deleté (u-softdel-1)
-- ============================================================
-- L'utilisateur a un compte actif, un rôle DIRECTION, mais son profil
-- est soft-deleté. Aucune opération financière ne doit être autorisée.
-- ============================================================

-- Test A.1 : SELECT sur fee_structures - doit retourner 0 lignes
SELECT set_config('request.jwt.claim.sub', 'u-softdel-1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.fee_structures
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST A.1 ÉCHEC : Soft-deleted peut SELECT % ligne(s) sur fee_structures', v_count;
  END IF;
  RAISE NOTICE 'OK A.1 — Profil soft-deleté : SELECT fee_structures = 0 ligne';
END $$;

-- Test A.2 : INSERT sur fee_structures - doit être refusé
DO $$
BEGIN
  INSERT INTO public.fee_structures (id, school_id, name, amount, fee_type, applies_to, created_at, updated_at)
  VALUES ('fs-test-softdel-1', '11111111-1111-4111-8111-111111111111', 'Test insert', 100.00, 'TEST', 'TOUS', NOW(), NOW());
  RAISE EXCEPTION 'TEST A.2 ÉCHEC : Soft-deleted a pu INSERT sur fee_structures';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK A.2 — Profil soft-deleté : INSERT fee_structures refusé';
  WHEN others THEN
    RAISE NOTICE 'OK A.2 — Profil soft-deleté : INSERT fee_structures refusé (erreur : %)', SQLERRM;
END $$;

-- Test A.3 : UPDATE sur fee_structures - doit être refusé
DO $$
BEGIN
  UPDATE public.fee_structures
  SET amount = 2000.00
  WHERE id = 'fs-active-1';
  RAISE EXCEPTION 'TEST A.3 ÉCHEC : Soft-deleted a pu UPDATE fee_structures';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK A.3 — Profil soft-deleté : UPDATE fee_structures refusé';
  WHEN others THEN
    RAISE NOTICE 'OK A.3 — Profil soft-deleté : UPDATE fee_structures refusé (erreur : %)', SQLERRM;
END $$;

-- Test A.4 : DELETE sur fee_structures - doit être refusé
DO $$
BEGIN
  DELETE FROM public.fee_structures
  WHERE id = 'fs-active-1';
  RAISE EXCEPTION 'TEST A.4 ÉCHEC : Soft-deleted a pu DELETE fee_structures';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK A.4 — Profil soft-deleté : DELETE fee_structures refusé';
  WHEN others THEN

-- ============================================================
-- 3. TESTS SCÉNARIO B : Profil actif (u-active-1)
-- ============================================================
-- L'utilisateur a un compte actif, un rôle DIRECTION, et un profil actif.
-- Les opérations doivent être autorisées.
-- ============================================================

-- Test B.1 : SELECT sur fee_structures - doit retourner les lignes
SELECT set_config('request.jwt.claim.sub', 'u-active-1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.fee_structures
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST B.1 ÉCHEC : Profil actif ne voit aucune ligne sur fee_structures';
  END IF;
  RAISE NOTICE 'OK B.1 — Profil actif : SELECT fee_structures = % ligne(s)', v_count;
END $$;

-- Test B.2 : SELECT sur payments - doit retourner les lignes
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.payments
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST B.2 ÉCHEC : Profil actif ne voit aucune ligne sur payments';
  END IF;
  RAISE NOTICE 'OK B.2 — Profil actif : SELECT payments = % ligne(s)', v_count;
END $$;

-- Test B.3 : INSERT sur fee_structures - doit être autorisé
DO $$
BEGIN
  INSERT INTO public.fee_structures (id, school_id, name, amount, fee_type, applies_to, created_at, updated_at)
  VALUES ('fs-test-active-1', '11111111-1111-4111-8111-111111111111', 'Test insert actif', 200.00, 'TEST', 'TOUS', NOW(), NOW());
  RAISE NOTICE 'OK B.3 — Profil actif : INSERT fee_structures autorisé';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'TEST B.3 ÉCHEC : Profil actif ne peut pas INSERT sur fee_structures';
  WHEN others THEN
    RAISE EXCEPTION 'TEST B.3 ÉCHEC : Erreur inattendue sur INSERT fee_structures : %', SQLERRM;
END $$;

-- Test B.4 : UPDATE sur fee_structures - doit être autorisé
DO $$
BEGIN
  UPDATE public.fee_structures
  SET amount = 1500.00
  WHERE id = 'fs-test-active-1';
  RAISE NOTICE 'OK B.4 — Profil actif : UPDATE fee_structures autorisé';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'TEST B.4 ÉCHEC : Profil actif ne peut pas UPDATE fee_structures';
  WHEN others THEN
    RAISE EXCEPTION 'TEST B.4 ÉCHEC : Erreur inattendue sur UPDATE fee_structures : %', SQLERRM;
END $$;

-- Test B.5 : DELETE sur fee_structures - doit être autorisé
DO $$
BEGIN
  DELETE FROM public.fee_structures
  WHERE id = 'fs-test-active-1';
  RAISE NOTICE 'OK B.5 — Profil actif : DELETE fee_structures autorisé';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'TEST B.5 ÉCHEC : Profil actif ne peut pas DELETE fee_structures';
  WHEN others THEN
    RAISE EXCEPTION 'TEST B.5 ÉCHEC : Erreur inattendue sur DELETE fee_structures : %', SQLERRM;
END $$;


-- ============================================================
-- 4. TESTS SCÉNARIO C : Isolation inter-établissements (u-wrongschool-1)
-- ============================================================
-- L'utilisateur a un profil actif et un rôle DIRECTION dans l'école Bêta,
-- mais tente d'accéder aux données de l'école Alpha. Doit être refusé.
-- ============================================================

-- Test C.1 : SELECT sur fee_structures de l'école Alpha - doit retourner 0 lignes
SELECT set_config('request.jwt.claim.sub', 'u-wrongschool-1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.fee_structures
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST C.1 ÉCHEC : Utilisateur école Bêta peut SELECT % ligne(s) sur fee_structures école Alpha', v_count;
  END IF;
  RAISE NOTICE 'OK C.1 — Isolation : Utilisateur école Bêta ne voit pas fee_structures école Alpha';
END $$;

-- Test C.2 : INSERT sur fee_structures de l'école Alpha - doit être refusé
DO $$
BEGIN
  INSERT INTO public.fee_structures (id, school_id, name, amount, fee_type, applies_to, created_at, updated_at)
  VALUES ('fs-test-isolation-1', '11111111-1111-4111-8111-111111111111', 'Test isolation', 100.00, 'TEST', 'TOUS', NOW(), NOW());
  RAISE EXCEPTION 'TEST C.2 ÉCHEC : Utilisateur école Bêta a pu INSERT sur fee_structures école Alpha';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK C.2 — Isolation : Utilisateur école Bêta ne peut pas INSERT sur fee_structures école Alpha';
  WHEN others THEN
    RAISE NOTICE 'OK C.2 — Isolation : Utilisateur école Bêta INSERT refusé (erreur : %)', SQLERRM;
END $$;

-- Test C.3 : UPDATE sur fee_structures de l'école Alpha - doit être refusé
DO $$
BEGIN
  UPDATE public.fee_structures
  SET amount = 9999.00
  WHERE id = 'fs-active-1';
  RAISE EXCEPTION 'TEST C.3 ÉCHEC : Utilisateur école Bêta a pu UPDATE fee_structures école Alpha';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK C.3 — Isolation : Utilisateur école Bêta ne peut pas UPDATE fee_structures école Alpha';
  WHEN others THEN
    RAISE NOTICE 'OK C.3 — Isolation : Utilisateur école Bêta UPDATE refusé (erreur : %)', SQLERRM;
END $$;

-- Test C.4 : DELETE sur fee_structures de l'école Alpha - doit être refusé
DO $$
BEGIN
  DELETE FROM public.fee_structures
  WHERE id = 'fs-active-1';
  RAISE EXCEPTION 'TEST C.4 ÉCHEC : Utilisateur école Bêta a pu DELETE fee_structures école Alpha';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK C.4 — Isolation : Utilisateur école Bêta ne peut pas DELETE fee_structures école Alpha';
  WHEN others THEN
    RAISE NOTICE 'OK C.4 — Isolation : Utilisateur école Bêta DELETE refusé (erreur : %)', SQLERRM;
END $$;

-- Test C.5 : SELECT sur payments de l'école Alpha - doit retourner 0 lignes
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.payments
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST C.5 ÉCHEC : Utilisateur école Bêta peut SELECT % ligne(s) sur payments école Alpha', v_count;
  END IF;
  RAISE NOTICE 'OK C.5 — Isolation : Utilisateur école Bêta ne voit pas payments école Alpha';
END $$;

-- Test C.6 : INSERT sur payments de l'école Alpha - doit être refusé
DO $$
BEGIN
  INSERT INTO public.payments (id, school_id, amount, payment_date, status, created_at, updated_at)
  VALUES ('pay-test-isolation-1', '11111111-1111-4111-8111-111111111111', 100.00, NOW(), 'PAYE', NOW(), NOW());
  RAISE EXCEPTION 'TEST C.6 ÉCHEC : Utilisateur école Bêta a pu INSERT sur payments école Alpha';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK C.6 — Isolation : Utilisateur école Bêta ne peut pas INSERT sur payments école Alpha';
  WHEN others THEN
    RAISE NOTICE 'OK C.6 — Isolation : Utilisateur école Bêta INSERT refusé (erreur : %)', SQLERRM;
END $$;

-- Test C.7 : UPDATE sur payments de l'école Alpha - doit être refusé
DO $$
BEGIN
  UPDATE public.payments
  SET amount = 9999.00
  WHERE id = 'pay-active-1';
  RAISE EXCEPTION 'TEST C.7 ÉCHEC : Utilisateur école Bêta a pu UPDATE payments école Alpha';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK C.7 — Isolation : Utilisateur école Bêta ne peut pas UPDATE payments école Alpha';
  WHEN others THEN
    RAISE NOTICE 'OK C.7 — Isolation : Utilisateur école Bêta UPDATE refusé (erreur : %)', SQLERRM;
END $$;

-- Test C.8 : DELETE sur payments de l'école Alpha - doit être refusé
DO $$
BEGIN
  DELETE FROM public.payments
  WHERE id = 'pay-active-1';
  RAISE EXCEPTION 'TEST C.8 ÉCHEC : Utilisateur école Bêta a pu DELETE payments école Alpha';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK C.8 — Isolation : Utilisateur école Bêta ne peut pas DELETE payments école Alpha';
  WHEN others THEN
    RAISE NOTICE 'OK C.8 — Isolation : Utilisateur école Bêta DELETE refusé (erreur : %)', SQLERRM;
END $$;


-- ============================================================
-- 5. TESTS SCÉNARIO D : Utilisateur sans rôle financier (u-no-role-1)
-- ============================================================
-- L'utilisateur a un compte actif, un profil actif, mais aucun rôle
-- DIRECTION ou COMPTABLE. Les opérations financières doivent être refusées.
-- ============================================================

-- Test D.1 : SELECT sur fee_structures - doit retourner 0 lignes
SELECT set_config('request.jwt.claim.sub', 'u-no-role-1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.fee_structures
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST D.1 ÉCHEC : Utilisateur sans rôle peut SELECT % ligne(s) sur fee_structures', v_count;
  END IF;
  RAISE NOTICE 'OK D.1 — Pas de rôle : SELECT fee_structures = 0 ligne';
END $$;

-- Test D.2 : INSERT sur fee_structures - doit être refusé
DO $$
BEGIN
  INSERT INTO public.fee_structures (id, school_id, name, amount, fee_type, applies_to, created_at, updated_at)
  VALUES ('fs-test-norole-1', '11111111-1111-4111-8111-111111111111', 'Test insert sans rôle', 100.00, 'TEST', 'TOUS', NOW(), NOW());
  RAISE EXCEPTION 'TEST D.2 ÉCHEC : Utilisateur sans rôle a pu INSERT sur fee_structures';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK D.2 — Pas de rôle : INSERT fee_structures refusé';
  WHEN others THEN
    RAISE NOTICE 'OK D.2 — Pas de rôle : INSERT fee_structures refusé (erreur : %)', SQLERRM;
END $$;

-- Test D.3 : SELECT sur payments - doit retourner 0 lignes
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.payments
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST D.3 ÉCHEC : Utilisateur sans rôle peut SELECT % ligne(s) sur payments', v_count;
  END IF;
  RAISE NOTICE 'OK D.3 — Pas de rôle : SELECT payments = 0 ligne';
END $$;

-- Test D.4 : INSERT sur payments - doit être refusé
DO $$
BEGIN
  INSERT INTO public.payments (id, school_id, amount, payment_date, status, created_at, updated_at)
  VALUES ('pay-test-norole-1', '11111111-1111-4111-8111-111111111111', 100.00, NOW(), 'PAYE', NOW(), NOW());
  RAISE EXCEPTION 'TEST D.4 ÉCHEC : Utilisateur sans rôle a pu INSERT sur payments';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK D.4 — Pas de rôle : INSERT payments refusé';
  WHEN others THEN
    RAISE NOTICE 'OK D.4 — Pas de rôle : INSERT payments refusé (erreur : %)', SQLERRM;
END $$;

-- ============================================================
-- 6. RÉCAPITULATIF
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===== RÉSUMÉ DES TESTS SEC06 =====';
  RAISE NOTICE 'A. Profil soft-deleté : Toutes les opérations refusées';
  RAISE NOTICE 'B. Profil actif : Toutes les opérations autorisées';
  RAISE NOTICE 'C. Isolation inter-établissements : Toutes les opérations refusées';
  RAISE NOTICE 'D. Utilisateur sans rôle : Toutes les opérations refusées';
  RAISE NOTICE '===== FIN DES TESTS SEC06 =====';
END $$;

-- ============================================================
-- ROLLBACK (ne pas valider les fixtures de test)
-- ============================================================
ROLLBACK;

SELECT 'Tous les tests sec06_financial_rls_profile_check_test.sql sont terminés.' AS status;

-- Test B.6 : INSERT sur payments - doit être autorisé
DO $$
BEGIN
  INSERT INTO public.payments (id, school_id, amount, payment_date, status, created_at, updated_at)
  VALUES ('pay-test-active-1', '11111111-1111-4111-8111-111111111111', 300.00, NOW(), 'PAYE', NOW(), NOW());
  RAISE NOTICE 'OK B.6 — Profil actif : INSERT payments autorisé';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'TEST B.6 ÉCHEC : Profil actif ne peut pas INSERT sur payments';
  WHEN others THEN
    RAISE EXCEPTION 'TEST B.6 ÉCHEC : Erreur inattendue sur INSERT payments : %', SQLERRM;
END $$;

-- Test B.7 : UPDATE sur payments - doit être autorisé
DO $$
BEGIN
  UPDATE public.payments
  SET amount = 400.00
  WHERE id = 'pay-test-active-1';
  RAISE NOTICE 'OK B.7 — Profil actif : UPDATE payments autorisé';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'TEST B.7 ÉCHEC : Profil actif ne peut pas UPDATE payments';
  WHEN others THEN
    RAISE EXCEPTION 'TEST B.7 ÉCHEC : Erreur inattendue sur UPDATE payments : %', SQLERRM;
END $$;

-- Test B.8 : DELETE sur payments - doit être autorisé
DO $$
BEGIN
  DELETE FROM public.payments
  WHERE id = 'pay-test-active-1';
  RAISE NOTICE 'OK B.8 — Profil actif : DELETE payments autorisé';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'TEST B.8 ÉCHEC : Profil actif ne peut pas DELETE payments';
  WHEN others THEN
    RAISE EXCEPTION 'TEST B.8 ÉCHEC : Erreur inattendue sur DELETE payments : %', SQLERRM;
END $$;

    RAISE NOTICE 'OK A.4 — Profil soft-deleté : DELETE fee_structures refusé (erreur : %)', SQLERRM;
END $$;

-- Test A.5 : SELECT sur payments - doit retourner 0 lignes
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.payments
  WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST A.5 ÉCHEC : Soft-deleted peut SELECT % ligne(s) sur payments', v_count;
  END IF;
  RAISE NOTICE 'OK A.5 — Profil soft-deleté : SELECT payments = 0 ligne';
END $$;

-- Test A.6 : INSERT sur payments - doit être refusé
DO $$
BEGIN
  INSERT INTO public.payments (id, school_id, amount, payment_date, status, created_at, updated_at)
  VALUES ('pay-test-softdel-1', '11111111-1111-4111-8111-111111111111', 100.00, NOW(), 'PAYE', NOW(), NOW());
  RAISE EXCEPTION 'TEST A.6 ÉCHEC : Soft-deleted a pu INSERT sur payments';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK A.6 — Profil soft-deleté : INSERT payments refusé';
  WHEN others THEN
    RAISE NOTICE 'OK A.6 — Profil soft-deleté : INSERT payments refusé (erreur : %)', SQLERRM;
END $$;

-- Test A.7 : UPDATE sur payments - doit être refusé
DO $$
BEGIN
  UPDATE public.payments
  SET amount = 600.00
  WHERE id = 'pay-active-1';
  RAISE EXCEPTION 'TEST A.7 ÉCHEC : Soft-deleted a pu UPDATE payments';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK A.7 — Profil soft-deleté : UPDATE payments refusé';
  WHEN others THEN
    RAISE NOTICE 'OK A.7 — Profil soft-deleté : UPDATE payments refusé (erreur : %)', SQLERRM;
END $$;

-- Test A.8 : DELETE sur payments - doit être refusé
DO $$
BEGIN
  DELETE FROM public.payments
  WHERE id = 'pay-active-1';
  RAISE EXCEPTION 'TEST A.8 ÉCHEC : Soft-deleted a pu DELETE payments';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK A.8 — Profil soft-deleté : DELETE payments refusé';
  WHEN others THEN
    RAISE NOTICE 'OK A.8 — Profil soft-deleté : DELETE payments refusé (erreur : %)', SQLERRM;
END $$;

  ('ur-wrongschool-1-dir', 'u-wrongschool-1', '22222222-2222-4222-8222-222222222222', 'role_dir'), -- DIRECTION, école Bêta, profil actif école Bêta
  ('ur-inactive-1-dir', 'u-inactive-1', '11111111-1111-4111-8111-111111111111', 'role_dir')    -- DIRECTION, école Alpha, compte INACTIVE
ON CONFLICT (id) DO NOTHING;

-- Données de test financières
INSERT INTO public.fee_structures (id, school_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at) VALUES
  ('fs-active-1', '11111111-1111-4111-8111-111111111111', 'Frais de scolarité Alpha', 1000.00, 'SCOLARITE', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW()),
  ('fs-wrongschool-1', '22222222-2222-4222-8222-222222222222', 'Frais de scolarité Beta', 1000.00, 'SCOLARITE', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payments (id, school_id, student_id, amount, payment_date, status, created_at, updated_at) VALUES
  ('pay-active-1', '11111111-1111-4111-8111-111111111111', NULL, 500.00, NOW(), 'PAYE', NOW(), NOW()),
  ('pay-wrongschool-1', '22222222-2222-4222-8222-222222222222', NULL, 500.00, NOW(), 'PAYE', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
