-- ============================================================
-- BOOTSTRAP — Création d'un compte SUPER_ADMIN côté Supabase
-- --------------------------------------------
-- À exécuter UNE FOIS dans le SQL Editor Supabase, APRÈS avoir
-- appliqué la migration 20261010190000_super_admin_rls.sql.
--
-- ⚠️  Changez l'email et le mot de passe ci-dessous avant d'exécuter.
-- ============================================================

DO $$
DECLARE
  v_email     text := 'admin@orion.app';      -- ← à changer
  v_password  text := 'ChangeMoi!2026';       -- ← à changer (min. 6 caractères)
  v_first     text := 'Super';
  v_last      text := 'Admin';
  v_user_id   uuid := gen_random_uuid();
  v_school_id uuid;
  v_role_id   text;
BEGIN
  -- 1) Établissement de rattachement (technique).
  --    profiles.user_id et user_roles.school_id sont NOT NULL : on réutilise
  --    une école existante, sinon on en crée une dédiée à l'administration.
  SELECT id INTO v_school_id FROM public.schools ORDER BY created_at LIMIT 1;
  IF v_school_id IS NULL THEN
    INSERT INTO public.schools (name, short_name, country, status)
    VALUES ('Orion — Administration', 'ORION-ADMIN', 'Togo', 'ACTIVE')
    RETURNING id INTO v_school_id;
  END IF;

  -- 2) Rôle SUPER_ADMIN (créé par la migration init).
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'SUPER_ADMIN' LIMIT 1;
  IF v_role_id IS NULL THEN
    INSERT INTO public.roles (id, name, description)
    VALUES ('role_admin', 'SUPER_ADMIN', 'Administrateur système')
    RETURNING id INTO v_role_id;
  END IF;

  -- 3) Utilisateur d'authentification (auth.users).
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    v_email, crypt(v_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', ''
  );

  -- 4) Identité email (requise pour signInWithPassword).
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email', now(), now(), now()
  );

  -- 5) Reflet dans public.users.
  INSERT INTO public.users (id, email, status)
  VALUES (v_user_id, v_email, 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;

  -- 6) Profil.
  INSERT INTO public.profiles (user_id, school_id, first_name, last_name)
  VALUES (v_user_id, v_school_id, v_first, v_last);

  -- 7) Attribution du rôle SUPER_ADMIN.
  INSERT INTO public.user_roles (user_id, school_id, role_id)
  VALUES (v_user_id, v_school_id, v_role_id);

  RAISE NOTICE 'Super-admin créé : % (id = %)', v_email, v_user_id;
END $$;

-- Vérification
SELECT u.email, r.name AS role
FROM public.users u
JOIN public.user_roles ur ON ur.user_id = u.id
JOIN public.roles r ON r.id = ur.role_id
WHERE r.name = 'SUPER_ADMIN';
