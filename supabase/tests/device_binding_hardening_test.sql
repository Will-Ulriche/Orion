BEGIN;

CREATE OR REPLACE FUNCTION public.test_device_set_current(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $test_current$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
END
$test_current$;

INSERT INTO public.roles (id, name) VALUES
  ('role-dir-test', 'DIRECTION'),
  ('role-sa-test', 'SUPER_ADMIN')
ON CONFLICT (name) DO NOTHING;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('d2000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'device-dir@test.local', '', now(), now(), now()),
  ('d2000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'device-dir2@test.local', '', now(), now(), now()),
  ('d2000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'device-sa@test.local', '', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, status) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'device-dir@test.local', 'ACTIVE'),
  ('d2000000-0000-4000-8000-000000000002', 'device-dir2@test.local', 'ACTIVE'),
  ('d2000000-0000-4000-8000-000000000003', 'device-sa@test.local', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

INSERT INTO public.schools (id, name) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'École appareils'),
  ('d1000000-0000-4000-8000-000000000002', 'École autre')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name) VALUES
  ('d4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Dir', 'Appareils'),
  ('d4000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Dir', 'Autre'),
  ('d4000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'Super', 'Admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('d5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', (SELECT id FROM public.roles WHERE name = 'DIRECTION')),
  ('d5000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'SUPER_ADMIN'))
ON CONFLICT (id) DO NOTHING;

SELECT set_config('orion.license_lifecycle', 'on', true);

INSERT INTO public.licenses (id, school_id, license_key, status, starts_at, expires_at, max_devices, is_current) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'ORION-DEVI-CE01-0001', 'ACTIVE', now() - interval '1 day', now() + interval '30 days', 1, true),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'ORION-DEVI-CE02-0002', 'ACTIVE', now() - interval '1 day', now() + interval '30 days', 2, true)
ON CONFLICT (id) DO NOTHING;

SELECT set_config('orion.license_lifecycle', 'off', true);

DO $schema_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'devices'
      AND column_name IN ('license_id', 'deleted_at')
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : colonnes license_id/deleted_at absentes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_or_reactivate_device'
      AND pg_get_functiondef(p.oid) LIKE '%FOR UPDATE%'
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : register_or_reactivate_device doit être SECURITY DEFINER et verrouiller la licence';
  END IF;
END
$schema_check$;

SELECT public.test_device_set_current('d2000000-0000-4000-8000-000000000001');

DO $first_registration$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.register_or_reactivate_device(
    'd3000000-0000-4000-8000-000000000001',
    'device-orion-001',
    'Poste 1',
    'Windows'
  );
  IF (v_res->>'license_id')::uuid <> 'd3000000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'ÉCHEC : licence renvoyée incohérente';
  END IF;
  IF (SELECT count(*) FROM public.devices WHERE status = 'ACTIVE' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'ÉCHEC : le premier appareil doit être actif';
  END IF;
END
$first_registration$;

DO $limit_reached$
BEGIN
  BEGIN
    PERFORM public.register_or_reactivate_device(
      'd3000000-0000-4000-8000-000000000001',
      'device-orion-002',
      'Poste 2',
      'Windows'
    );
    RAISE EXCEPTION 'ÉCHEC : limite max_devices=1 non appliquée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM NOT LIKE 'Limite%' THEN
      RAISE;
    END IF;
  END;
END
$limit_reached$;

DO $same_device_reactivation$
BEGIN
  PERFORM public.register_or_reactivate_device(
    'd3000000-0000-4000-8000-000000000001',
    'device-orion-001',
    'Poste 1 renommé',
    'Windows'
  );
  IF (SELECT count(*) FROM public.devices WHERE status = 'ACTIVE' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'ÉCHEC : la réactivation ne doit pas créer de doublon';
  END IF;
END
$same_device_reactivation$;

SELECT public.test_device_set_current('d2000000-0000-4000-8000-000000000002');
DO $wrong_school$
BEGIN
  BEGIN
    PERFORM public.register_or_reactivate_device(
      'd3000000-0000-4000-8000-000000000001',
      'device-orion-wrong-school',
      NULL,
      NULL
    );
    RAISE EXCEPTION 'ÉCHEC : un dirigeant ne doit pas enregistrer pour une autre école';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE;
    END IF;
  END;
END
$wrong_school$;

SELECT public.test_device_set_current('d2000000-0000-4000-8000-000000000003');

DO $super_admin_release$
DECLARE
  v_device_id uuid;
BEGIN
  SELECT id INTO v_device_id
    FROM public.devices
   WHERE device_identifier = 'device-orion-001';

  PERFORM public.release_device(v_device_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE id = v_device_id AND status = 'REVOKED' AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : release_device doit révoquer et dater l''appareil';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE device_id = v_device_id AND action = 'DEVICE_RELEASED'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : release_device doit écrire dans audit_logs';
  END IF;
END
$super_admin_release$;

SELECT public.test_device_set_current('d2000000-0000-4000-8000-000000000001');

DO $registration_after_release$
BEGIN
  PERFORM public.register_or_reactivate_device(
    'd3000000-0000-4000-8000-000000000001',
    'device-orion-002',
    'Poste 2',
    'Windows'
  );
  IF (SELECT count(*) FROM public.devices WHERE status = 'ACTIVE' AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'ÉCHEC : un nouvel appareil doit pouvoir prendre la place libérée';
  END IF;
END
$registration_after_release$;

UPDATE public.licenses
   SET max_devices = 2
 WHERE id = 'd3000000-0000-4000-8000-000000000001';

DO $second_slot$
BEGIN
  PERFORM public.register_or_reactivate_device(
    'd3000000-0000-4000-8000-000000000001',
    'device-orion-003',
    'Poste 3',
    'Windows'
  );
  IF (SELECT count(*) FROM public.devices WHERE status = 'ACTIVE' AND deleted_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'ÉCHEC : deux appareils doivent être actifs quand max_devices=2';
  END IF;
END
$second_slot$;

SELECT public.test_device_set_current('d2000000-0000-4000-8000-000000000002');

DO $cross_license_rejected$
BEGIN
  BEGIN
    PERFORM public.register_or_reactivate_device(
      'd3000000-0000-4000-8000-000000000002',
      'device-orion-003',
      NULL,
      NULL
    );
    RAISE EXCEPTION 'ÉCHEC : un appareil actif ne doit pas changer de licence';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE;
    END IF;
  END;
END
$cross_license_rejected$;

ROLLBACK;
