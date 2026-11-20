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

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'active@test.local', '', NOW(), NOW(), NOW()),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'softdel@test.local', '', NOW(), NOW(), NOW()),
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noprofile@test.local', '', NOW(), NOW(), NOW()),
  ('a4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wrongschool@test.local', '', NOW(), NOW(), NOW()),
  ('a5555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inactive@test.local', '', NOW(), NOW(), NOW()),
  ('a6666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'norole@test.local', '', NOW(), NOW(), NOW()),
  ('a7777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'active2@test.local', '', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'École Alpha'),
  ('22222222-2222-4222-8222-222222222222', 'École Bêta')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at) VALUES
  ('90111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '2026-2027', DATE '2026-09-01', DATE '2027-06-30', 'ACTIVE', true, NOW(), NOW()),
  ('90222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '2026-2027', DATE '2026-09-01', DATE '2027-06-30', 'ACTIVE', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.students (id, school_id, first_name, last_name, created_at, updated_at) VALUES
  ('90311111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Finance', 'Alpha', NOW(), NOW()),
  ('90322222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Finance', 'Beta', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.enrollments (id, school_id, academic_year_id, student_id, enrollment_type, created_at, updated_at) VALUES
  ('90411111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', 'INITIAL', NOW(), NOW()),
  ('90422222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '90222222-2222-4222-8222-222222222222', '90322222-2222-4222-8222-222222222222', 'INITIAL', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name) VALUES
  ('role_dir', 'DIRECTION'),
  ('role_sec', 'SECRETAIRE'),
  ('role_compta', 'COMPTABLE'),
  ('role_prof', 'PROFESSEUR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, status) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'active@test.local', 'ACTIVE'),
  ('a2222222-2222-4222-8222-222222222222', 'softdel@test.local', 'ACTIVE'),
  ('a3333333-3333-4333-8333-333333333333', 'noprofile@test.local', 'ACTIVE'),
  ('a4444444-4444-4444-8444-444444444444', 'wrongschool@test.local', 'ACTIVE'),
  ('a5555555-5555-4555-8555-555555555555', 'inactive@test.local', 'INACTIVE'),
  ('a6666666-6666-4666-8666-666666666666', 'norole@test.local', 'ACTIVE'),
  ('a7777777-7777-4777-8777-777777777777', 'active2@test.local', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Active', 'One', NULL),
  ('b2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Soft', 'Deleted', NOW()),
  ('b4444444-4444-4444-8444-444444444444', 'a4444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Wrong', 'School', NULL),
  ('b5555555-5555-4555-8555-555555555555', 'a5555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Inactive', 'One', NULL),
  ('b6666666-6666-4666-8666-666666666666', 'a6666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'NoRole', 'One', NULL),
  ('b7777777-7777-4777-8777-777777777777', 'a7777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'Active', 'Two', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c3333333-3333-4333-8333-333333333333', 'a3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c4444444-4444-4444-8444-444444444444', 'a4444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'role_dir'),
  ('c5555555-5555-4555-8555-555555555555', 'a5555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'role_dir'),
  ('c7777777-7777-4777-8777-777777777777', 'a7777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'role_prof')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at) VALUES
  ('d1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'Frais Alpha', 1000.00, 'SCOLARITE', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW()),
  ('d2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '90222222-2222-4222-8222-222222222222', 'Frais Bêta', 1000.00, 'SCOLARITE', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at) VALUES
  ('e1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 500.00, NOW(), 'ESPECES', NULL, 'SEC06-A-1', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW()),
  ('e2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '90222222-2222-4222-8222-222222222222', '90422222-2222-4222-8222-222222222222', '90322222-2222-4222-8222-222222222222', NULL, 500.00, NOW(), 'ESPECES', NULL, 'SEC06-B-1', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. SCÉNARIO A — Profil soft-deleté : tout refusé
-- ============================================================

SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.fee_structures WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.1 ÉCHEC : soft-deleted voit % ligne(s) sur fee_structures', v_count;
  END IF;
  RAISE NOTICE 'OK A.1';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
    VALUES ('f1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'A.2', 100.00, 'TEST', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.2 ÉCHEC : INSERT fee_structures autorisé';
  END IF;
  RAISE NOTICE 'OK A.2';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    UPDATE public.fee_structures SET amount = 2000.00 WHERE id = 'd1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.3 ÉCHEC : % ligne(s) modifiée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK A.3';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.fee_structures WHERE id = 'd1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.4 ÉCHEC : % ligne(s) supprimée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK A.4';
END
$sec06$;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.payments WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.5 ÉCHEC : soft-deleted voit % ligne(s) sur payments', v_count;
  END IF;
  RAISE NOTICE 'OK A.5';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at)
    VALUES ('f2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 100.00, NOW(), 'ESPECES', NULL, 'SEC06-A2', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.6 ÉCHEC : INSERT payments autorisé';
  END IF;
  RAISE NOTICE 'OK A.6';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    UPDATE public.payments SET amount = 600.00 WHERE id = 'e1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.7 ÉCHEC : % ligne(s) modifiée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK A.7';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.payments WHERE id = 'e1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST A.8 ÉCHEC : % ligne(s) supprimée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK A.8';
END
$sec06$;

-- ============================================================
-- 3. SCÉNARIO B — Profil actif DIRECTION : tout autorisé
-- ============================================================

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);

DO $sec06$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.fee_structures WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST B.1 ÉCHEC : aucune ligne visible sur fee_structures';
  END IF;
  RAISE NOTICE 'OK B.1';
END
$sec06$;

DO $sec06$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.payments WHERE school_id = '11111111-1111-4111-8111-111111111111';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST B.2 ÉCHEC : aucune ligne visible sur payments';
  END IF;
  RAISE NOTICE 'OK B.2';
END
$sec06$;

DO $sec06$
BEGIN
  INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
  VALUES ('f3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'B.3', 200.00, 'TEST', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW());
  RAISE NOTICE 'OK B.3';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.fee_structures SET amount = 1500.00 WHERE id = 'f3333333-3333-4333-8333-333333333333';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TEST B.4 ÉCHEC : % ligne(s) modifiée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK B.4';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.fee_structures WHERE id = 'f3333333-3333-4333-8333-333333333333';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TEST B.5 ÉCHEC : % ligne(s) supprimée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK B.5';
END
$sec06$;

DO $sec06$
BEGIN
  INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at)
  VALUES ('f4444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 300.00, NOW(), 'ESPECES', NULL, 'SEC06-B6', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW());
  RAISE NOTICE 'OK B.6';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.payments SET amount = 400.00 WHERE id = 'f4444444-4444-4444-8444-444444444444';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TEST B.7 ÉCHEC : % ligne(s) modifiée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK B.7';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.payments WHERE id = 'f4444444-4444-4444-8444-444444444444';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'TEST B.8 ÉCHEC : % ligne(s) supprimée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK B.8';
END
$sec06$;

-- ============================================================
-- 4. SCÉNARIO C — Isolation inter-établissements : tout refusé sur Alpha
-- ============================================================

SELECT set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444444', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.fee_structures WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.1 ÉCHEC : Bêta voit % ligne(s) sur Alpha', v_count;
  END IF;
  RAISE NOTICE 'OK C.1';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
    VALUES ('f5555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'C.2', 100.00, 'TEST', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.2 ÉCHEC : INSERT sur Alpha autorisé';
  END IF;
  RAISE NOTICE 'OK C.2';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    UPDATE public.fee_structures SET amount = 9999.00 WHERE id = 'd1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.3 ÉCHEC : % ligne(s) modifiée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK C.3';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.fee_structures WHERE id = 'd1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.4 ÉCHEC : % ligne(s) supprimée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK C.4';
END
$sec06$;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.payments WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.5 ÉCHEC : Bêta voit % ligne(s) sur Alpha', v_count;
  END IF;
  RAISE NOTICE 'OK C.5';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at)
    VALUES ('f6666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 100.00, NOW(), 'ESPECES', NULL, 'SEC06-C6', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.6 ÉCHEC : INSERT payments sur Alpha autorisé';
  END IF;
  RAISE NOTICE 'OK C.6';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    UPDATE public.payments SET amount = 9999.00 WHERE id = 'e1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.7 ÉCHEC : % ligne(s) modifiée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK C.7';
END
$sec06$;

DO $sec06$
DECLARE
  v_rows integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.payments WHERE id = 'e1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_refused := (coalesce(v_rows, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST C.8 ÉCHEC : % ligne(s) supprimée(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK C.8';
END
$sec06$;

-- ============================================================
-- 5. SCÉNARIO D — Profil actif sans rôle financier : tout refusé
-- ============================================================

SELECT set_config('request.jwt.claim.sub', 'a7777777-7777-4777-8777-777777777777', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a7777777-7777-4777-8777-777777777777', 'role', 'authenticated')::text, true);

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.fee_structures WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST D.1 ÉCHEC : sans rôle voit % ligne(s) sur fee_structures', v_count;
  END IF;
  RAISE NOTICE 'OK D.1';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
    VALUES ('f7777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'D.2', 100.00, 'TEST', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST D.2 ÉCHEC : INSERT fee_structures autorisé';
  END IF;
  RAISE NOTICE 'OK D.2';
END
$sec06$;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.payments WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST D.3 ÉCHEC : sans rôle voit % ligne(s) sur payments', v_count;
  END IF;
  RAISE NOTICE 'OK D.3';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at)
    VALUES ('f8888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 100.00, NOW(), 'ESPECES', NULL, 'SEC06-D4', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST D.4 ÉCHEC : INSERT payments autorisé';
  END IF;
  RAISE NOTICE 'OK D.4';
END
$sec06$;

-- ============================================================
-- 6. SCÉNARIO E — Compte INACTIVE : tout refusé
-- ============================================================

SELECT set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555555', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.fee_structures WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST E.1 ÉCHEC : compte inactif voit % ligne(s) sur fee_structures', v_count;
  END IF;
  RAISE NOTICE 'OK E.1';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
    VALUES ('f9999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'E.2', 100.00, 'TEST', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST E.2 ÉCHEC : INSERT fee_structures autorisé';
  END IF;
  RAISE NOTICE 'OK E.2';
END
$sec06$;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.payments WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST E.3 ÉCHEC : compte inactif voit % ligne(s) sur payments', v_count;
  END IF;
  RAISE NOTICE 'OK E.3';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at)
    VALUES ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 100.00, NOW(), 'ESPECES', NULL, 'SEC06-E4', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST E.4 ÉCHEC : INSERT payments autorisé';
  END IF;
  RAISE NOTICE 'OK E.4';
END
$sec06$;

-- ============================================================
-- 7. SCÉNARIO F — Rôle DIRECTION sans profil : tout refusé
-- ============================================================

SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.fee_structures WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST F.1 ÉCHEC : sans profil voit % ligne(s) sur fee_structures', v_count;
  END IF;
  RAISE NOTICE 'OK F.1';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
    VALUES ('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'F.2', 100.00, 'TEST', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST F.2 ÉCHEC : INSERT fee_structures autorisé';
  END IF;
  RAISE NOTICE 'OK F.2';
END
$sec06$;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.payments WHERE school_id = '11111111-1111-4111-8111-111111111111';
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST F.3 ÉCHEC : sans profil voit % ligne(s) sur payments', v_count;
  END IF;
  RAISE NOTICE 'OK F.3';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at)
    VALUES ('fccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 100.00, NOW(), 'ESPECES', NULL, 'SEC06-F4', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST F.4 ÉCHEC : INSERT payments autorisé';
  END IF;
  RAISE NOTICE 'OK F.4';
END
$sec06$;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.fee_structures;
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST G.1 ÉCHEC : anon voit % ligne(s) sur fee_structures', v_count;
  END IF;
  RAISE NOTICE 'OK G.1';
END
$sec06$;

DO $sec06$
DECLARE
  v_count integer;
  v_refused boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.payments;
    v_refused := (coalesce(v_count, 0) = 0);
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST G.2 ÉCHEC : anon voit % ligne(s) sur payments', v_count;
  END IF;
  RAISE NOTICE 'OK G.2';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
    VALUES ('fddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', 'G.3', 100.00, 'TEST', 'TOUS', NULL, NULL, NULL, true, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST G.3 ÉCHEC : INSERT fee_structures anon autorisé';
  END IF;
  RAISE NOTICE 'OK G.3';
END
$sec06$;

DO $sec06$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, cancelled_at, cancel_reason, created_at, updated_at)
    VALUES ('feeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', '90111111-1111-4111-8111-111111111111', '90411111-1111-4111-8111-111111111111', '90311111-1111-4111-8111-111111111111', NULL, 100.00, NOW(), 'ESPECES', NULL, 'SEC06-G4', NULL, 'test', 'VALID', NULL, NULL, NOW(), NOW());
  EXCEPTION
    WHEN insufficient_privilege THEN v_refused := true;
    WHEN SQLSTATE '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'TEST G.4 ÉCHEC : INSERT payments anon autorisé';
  END IF;
  RAISE NOTICE 'OK G.4';
END
$sec06$;

RESET ROLE;

DO $sec06$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===== RÉSUMÉ DES TESTS SEC06 =====';
  RAISE NOTICE 'A. Profil soft-deleté : refusé';
  RAISE NOTICE 'B. Profil actif DIRECTION : autorisé';
  RAISE NOTICE 'C. Isolation inter-établissements : refusé';
  RAISE NOTICE 'D. Profil actif sans rôle financier : refusé';
  RAISE NOTICE 'E. Compte INACTIVE : refusé';
  RAISE NOTICE 'F. Rôle DIRECTION sans profil : refusé';
  RAISE NOTICE 'G. Rôle anon : refusé';
  RAISE NOTICE '===== FIN DES TESTS SEC06 =====';
END
$sec06$;

ROLLBACK;
