-- Le rôle COMPTABLE est requis par les politiques RLS financières et les
-- autorisations de l'application, mais n'était pas inséré dans les rôles de base.
INSERT INTO public.roles (id, name, description)
VALUES ('role_compta', 'COMPTABLE', 'Comptabilité établissement')
ON CONFLICT (name) DO NOTHING;
