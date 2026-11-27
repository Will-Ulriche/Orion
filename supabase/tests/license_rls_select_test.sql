BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('2a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-sa@test.local', '', NOW(), NOW(), NOW()),
  ('2a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-dir-a@test.local', '', NOW(), NOW(), NOW()),
  ('2a000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000000', 'authenticated', 'authenticated', 'rls-dir-b@test.local', '', NOW(), NOW(), NOW()),
  ('2a000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-sec@test.local', '', NOW(), NOW(), NOW()),
  ('2a000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-prof@test.local', '', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  ('2b000000-0000-4000-8000-000000000001', 'École A'),
  ('2b000000-0000-4000-8000-000000000002', 'École B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name) VALUES
  ('role_admin', 'SUPER_ADMIN'),
  ('role_dir', 'DIRECTION'),
  ('role_sec', 'SECRETAIRE'),
  ('role_prof', 'PROFESSEUR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, status) VALUES
  ('2a000000-0000-4000-8000-000000000001', 'rls-sa@test.local', 'ACTIVE'),
  ('2a000000-0000-4000-8000-000000000002', 'rls-dir-a@test.local', 'ACTIVE'),
  ('2a000000-0000-4000-8000-000000000003', 'rls-dir-b@test.local', 'ACTIVE'),
  ('2a000000-0000-4000-8000-000000000004', 'rls-sec@test.local', 'ACTIVE'),
  ('2a000000-0000-4000-8000-000000000005', 'rls-prof@test.local', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name, deleted_at) VALUES
  ('2c000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'Sa', 'Test', NULL),
  ('2c000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000001', 'Dir', 'A', NULL),
  ('2c000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000002', 'Dir', 'B', NULL),
  ('2c000000-0000-4000-8000-000000000004', '2a000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000001', 'Sec', 'A', NULL),
  ('2c000000-0000-4000-8000-000000000005', '2a000000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000001', 'Prof', 'A', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('2d000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'role_admin'),
  ('2d000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000001', 'role_dir'),
  ('2d000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000002', 'role_dir'),
  ('2d000000-0000-4000-8000-000000000004', '2a000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000001', 'role_sec'),
  ('2d000000-0000-4000-8000-000000000005', '2a000000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000001', 'role_prof')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.licenses (id, school_id, license_key, status, is_current, max_devices) VALUES
  ('2e000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'ORION-RLS-A', 'ACTIVE', true, 5),
  ('2e000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002', 'ORION-RLS-B', 'ACTIVE', true, 5)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF to_regprocedure('public.is_super_admin()') IS NULL OR to_regprocedure('public.user_school_ids()') IS NULL THEN
    RAISE EXCEPTION 'Fonctions RLS manquantes';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'licenses'
      AND cmd = 'SELECT'
      AND policyname = 'sec08_licenses_select'
      AND 'authenticated' = ANY(roles)
      AND qual LIKE '%is_super_admin%'
      AND qual LIKE '%user_school_ids%'
  ) THEN
    RAISE EXCEPTION 'Politique de lecture des licences non conforme';
  END IF;
  IF has_table_privilege('anon', 'public.licenses', 'SELECT') THEN
    RAISE EXCEPTION 'anon peut lire public.licenses';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '2a000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.licenses;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ÉCHEC : SUPER_ADMIN lit % licences au lieu de 2', v_count;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '2a000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_count integer;
  v_key text;
BEGIN
  SELECT count(*), min(license_key) INTO v_count, v_key FROM public.licenses;
  IF v_count <> 1 OR v_key <> 'ORION-RLS-A' THEN
    RAISE EXCEPTION 'ÉCHEC : DIRECTION A voit % / %', v_count, v_key;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '2a000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_count integer;
  v_key text;
BEGIN
  SELECT count(*), min(license_key) INTO v_count, v_key FROM public.licenses;
  IF v_count <> 1 OR v_key <> 'ORION-RLS-B' THEN
    RAISE EXCEPTION 'ÉCHEC : DIRECTION B voit % / %', v_count, v_key;
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '2a000000-0000-4000-8000-000000000004', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  v_blocked := false;
  BEGIN
    UPDATE public.licenses SET status = 'SUSPENDED' WHERE license_key = 'ORION-RLS-A';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : SECRETAIRE a pu modifier une licence';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.licenses (id, school_id, license_key, status, is_current, max_devices)
    VALUES ('2e000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000001', 'ORION-RLS-X', 'ACTIVE', false, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : SECRETAIRE a pu créer une licence';
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM public.licenses WHERE license_key = 'ORION-RLS-A';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : SECRETAIRE a pu supprimer une licence';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000005', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '2a000000-0000-4000-8000-000000000005', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_blocked boolean;
BEGIN
  v_blocked := false;
  BEGIN
    UPDATE public.licenses SET status = 'REVOKED' WHERE license_key = 'ORION-RLS-A';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : PROFESSEUR a pu modifier une licence';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.licenses (id, school_id, license_key, status, is_current, max_devices)
    VALUES ('2e000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000001', 'ORION-RLS-Y', 'ACTIVE', false, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : PROFESSEUR a pu créer une licence';
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM public.licenses WHERE license_key = 'ORION-RLS-A';
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : PROFESSEUR a pu supprimer une licence';
  END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.licenses;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ÉCHEC : anonyme a pu lire les licences';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
