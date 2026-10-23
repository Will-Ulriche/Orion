-- Rattache les profils existants aux fiches du personnel.
-- 1) Rapprochement par email (comptes secrétaire, comptable, professeurs).
UPDATE public.profiles p
   SET staff_id = s.id,
       updated_at = now()
  FROM public.users u,
       public.staff s
 WHERE u.id = p.user_id
   AND s.school_id = p.school_id
   AND s.email IS NOT NULL
   AND lower(s.email) = lower(u.email)
   AND p.staff_id IS NULL;

-- 2) Compte DIRECTION : rattachement au responsable de l'établissement
--    (fiche dont le matricule se termine par -P-0001), même si l'email de
--    connexion diffère de celui du personnel.
UPDATE public.profiles p
   SET staff_id = s.id,
       updated_at = now()
  FROM public.user_roles ur,
       public.roles r,
       public.staff s
 WHERE ur.user_id = p.user_id
   AND ur.school_id = p.school_id
   AND r.id = ur.role_id
   AND r.name = 'DIRECTION'
   AND s.school_id = p.school_id
   AND s.matricule LIKE '%-P-0001'
   AND p.staff_id IS NULL;
