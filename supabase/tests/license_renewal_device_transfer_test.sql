-- ============================================================
-- LIC-02 / LIC-03 : renouvellement + liaison des appareils
-- Vérifie le transfert transactionnel des appareils actifs, le
-- contrôle de quota, le cas « archivage sans renouvellement »
-- et l'interdiction de transférer depuis un autre établissement.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.test_renewal_set_current(p_user_id uuid)
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
  ('role-renew-dir', 'DIRECTION'),
  ('role-renew-sa', 'SUPER_ADMIN')
ON CONFLICT (name) DO NOTHING;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('f2000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'renew-sa@test.local', '', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, status) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'renew-sa@test.local', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE';

INSERT INTO public.schools (id, name) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'Renouvellement A'),
  ('f1000000-0000-4000-8000-000000000002', 'Renouvellement B'),
  ('f1000000-0000-4000-8000-000000000003', 'Renouvellement C')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, user_id, school_id, first_name, last_name) VALUES
  ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Super', 'Admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (id, user_id, school_id, role_id) VALUES
  ('f5000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', (SELECT id FROM public.roles WHERE name = 'SUPER_ADMIN'))
ON CONFLICT (id) DO NOTHING;

SELECT public.test_renewal_set_current('f2000000-0000-4000-8000-000000000001');
SELECT set_config('orion.license_lifecycle', 'on', true);

INSERT INTO public.licenses (id, school_id, license_key, status, starts_at, expires_at, max_devices, is_current) VALUES
  ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'ORION-REN1-0001-0001', 'ACTIVE', now() - interval '1 day', now() + interval '30 days', 3, true),
  ('f3000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'ORION-REN1-0002-0002', 'ACTIVE', now() - interval '1 day', now() + interval '30 days', 3, true),
  ('f3000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000003', 'ORION-REN1-0003-0003', 'ACTIVE', now() - interval '1 day', now() + interval '30 days', 3, true)
ON CONFLICT (id) DO NOTHING;

SELECT set_config('orion.license_lifecycle', 'off', true);

INSERT INTO public.devices (id, school_id, license_id, device_identifier, device_name, platform, status) VALUES
  ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'renew-pc-1', 'Poste 1', 'Windows', 'ACTIVE'),
  ('f6000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'renew-pc-2', 'Poste 2', 'Windows', 'ACTIVE'),
  ('f6000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002', 'renew-b-1', 'Poste B1', 'Linux', 'ACTIVE'),
  ('f6000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002', 'renew-b-2', 'Poste B2', 'Linux', 'ACTIVE'),
  ('f6000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002', 'renew-foreign-license', 'Licence étrangère', 'Windows', 'ACTIVE'),
  ('f6000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000003', 'renew-c-1', 'Poste C1', 'macOS', 'ACTIVE'),
  ('f6000000-0000-4000-8000-000000000007', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'renew-revoked-1', 'Poste révoqué', 'Windows', 'REVOKED')
ON CONFLICT (id) DO NOTHING;

UPDATE public.devices
   SET deleted_at = now()
 WHERE id = 'f6000000-0000-4000-8000-000000000007' AND deleted_at IS NULL;

-- 1. Renouvellement : archivage + création + transfert des appareils actifs.
DO $renewal_transfer$
DECLARE
  v_res jsonb;
  v_new_id uuid;
BEGIN
  v_res := public.renew_license(
    'f1000000-0000-4000-8000-000000000001',
    'ORION-REN2-0001-0001',
    now() - interval '1 day',
    now() + interval '30 days',
    3,
    'ACTIVE'
  );
  v_new_id := (v_res->>'id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.licenses
     WHERE id = 'f3000000-0000-4000-8000-000000000001'
       AND is_current = false AND status = 'SUPERSEDED'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : l''ancienne licence doit être archivée';
  END IF;

  IF (SELECT count(*) FROM public.devices
       WHERE license_id = v_new_id AND deleted_at IS NULL AND status = 'ACTIVE') <> 2 THEN
    RAISE EXCEPTION 'ÉCHEC : les deux appareils actifs doivent être transférés';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE id = 'f6000000-0000-4000-8000-000000000001'
       AND license_id = v_new_id AND device_identifier = 'renew-pc-1'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE id = 'f6000000-0000-4000-8000-000000000002'
       AND license_id = v_new_id AND device_identifier = 'renew-pc-2'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : identifiants physiques et historique des appareils conservés';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE id = 'f6000000-0000-4000-8000-000000000003'
       AND license_id = 'f3000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : un appareil révoqué ne doit pas être transféré';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE id = 'f6000000-0000-4000-8000-000000000005'
       AND license_id = 'f3000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : aucun appareil lié à une licence d''un autre établissement ne doit être transféré';
  END IF;

  -- Réactivation de PC1 sur la nouvelle licence : plus de conflit « déjà associé ».
  PERFORM public.register_or_reactivate_device(v_new_id, 'renew-pc-1', 'Poste 1', 'Windows');

  IF (SELECT count(*) FROM public.devices
       WHERE license_id = v_new_id AND deleted_at IS NULL AND status = 'ACTIVE') <> 2 THEN
    RAISE EXCEPTION 'ÉCHEC : la réactivation ne doit pas créer de doublon';
  END IF;
END
$renewal_transfer$;

-- 2. Quota insuffisant : aucun effet de bord (archivage/insertion/transfert).
DO $quota_rejected$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.renew_license(
      'f1000000-0000-4000-8000-000000000002',
      'ORION-REN3-0002-0002',
      now() - interval '1 day',
      now() + interval '30 days',
      1,
      'ACTIVE'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0001' OR SQLERRM NOT LIKE 'Quota insuffisant%' THEN
      RAISE;
    END IF;
    v_raised := true;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'ÉCHEC : le renouvellement devait être refusé pour quota insuffisant';
  END IF;

  IF EXISTS (SELECT 1 FROM public.licenses WHERE license_key = 'ORION-REN3-0002-0002') THEN
    RAISE EXCEPTION 'ÉCHEC : aucune licence ne doit être créée si le quota est insuffisant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.licenses
     WHERE id = 'f3000000-0000-4000-8000-000000000002' AND is_current = true
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : l''ancienne licence doit rester courante après refus';
  END IF;

  IF (SELECT count(*) FROM public.devices
       WHERE license_id = 'f3000000-0000-4000-8000-000000000002'
         AND deleted_at IS NULL AND status = 'ACTIVE') <> 2 THEN
    RAISE EXCEPTION 'ÉCHEC : les appareils ne doivent pas être modifiés après refus';
  END IF;
END
$quota_rejected$;

-- 3. Appareil lié à une licence ACTIVE d'un autre établissement : refus.
DO $foreign_license_rejected$
BEGIN
  BEGIN
    PERFORM public.register_or_reactivate_device(
      'f3000000-0000-4000-8000-000000000002',
      'renew-foreign-license'
    );
    RAISE EXCEPTION 'ÉCHEC : un appareil actif ne doit pas changer de licence';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' THEN
      RAISE;
    END IF;
  END;
END
$foreign_license_rejected$;

-- 4. Archivage sans renouvellement immédiat, puis renouvellement :
--    les appareils restés sur la licence archivée sont transférés.
DO $archive_then_renew$
DECLARE
  v_res jsonb;
  v_new_id uuid;
BEGIN
  PERFORM public.archive_license('f3000000-0000-4000-8000-000000000003');

  IF NOT EXISTS (
    SELECT 1 FROM public.licenses
     WHERE id = 'f3000000-0000-4000-8000-000000000003'
       AND is_current = false AND status = 'REVOKED'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : archive_license doit révoquer la licence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE id = 'f6000000-0000-4000-8000-000000000006'
       AND license_id = 'f3000000-0000-4000-8000-000000000003'
       AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : l''archivage ne supprime pas l''historique des appareils';
  END IF;

  v_res := public.renew_license(
    'f1000000-0000-4000-8000-000000000003',
    'ORION-REN4-0003-0003',
    now() - interval '1 day',
    now() + interval '30 days',
    2,
    'ACTIVE'
  );
  v_new_id := (v_res->>'id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE id = 'f6000000-0000-4000-8000-000000000006'
       AND license_id = v_new_id
       AND device_identifier = 'renew-c-1'
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : l''appareil de la licence archivée doit être transféré';
  END IF;
END
$archive_then_renew$;

-- 5. Filet de sécurité : un appareil resté actif sur une licence archivée
--    du même établissement peut être réaffecté à la licence courante.
DO $archived_license_rebind$
DECLARE
  v_new_id uuid;
BEGIN
  SELECT id INTO v_new_id
    FROM public.licenses
   WHERE license_key = 'ORION-REN2-0001-0001';

  INSERT INTO public.devices (school_id, license_id, device_identifier, status)
  VALUES (
    'f1000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    'renew-late-1',
    'ACTIVE'
  );

  PERFORM public.register_or_reactivate_device(v_new_id, 'renew-late-1');

  IF NOT EXISTS (
    SELECT 1 FROM public.devices
     WHERE device_identifier = 'renew-late-1' AND license_id = v_new_id
  ) THEN
    RAISE EXCEPTION 'ÉCHEC : la réaffectation depuis une licence archivée doit réussir';
  END IF;
END
$archived_license_rebind$;

ROLLBACK;
