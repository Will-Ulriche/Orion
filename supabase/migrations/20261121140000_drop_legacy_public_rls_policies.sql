DROP POLICY IF EXISTS academic_years_all ON public.academic_years;
DROP POLICY IF EXISTS classes_all ON public.classes;
DROP POLICY IF EXISTS enrollments_all ON public.enrollments;
DROP POLICY IF EXISTS students_all ON public.students;
DROP POLICY IF EXISTS audit_logs_all ON public.audit_logs;
DROP POLICY IF EXISTS devices_all ON public.devices;
DROP POLICY IF EXISTS enrollment_history_all ON public.enrollment_history;
DROP POLICY IF EXISTS licenses_all ON public.licenses;
DROP POLICY IF EXISTS profiles_all ON public.profiles;
DROP POLICY IF EXISTS roles_select ON public.roles;
DROP POLICY IF EXISTS schools_select ON public.schools;
DROP POLICY IF EXISTS schools_update ON public.schools;
DROP POLICY IF EXISTS user_roles_all ON public.user_roles;
DROP POLICY IF EXISTS users_select ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
DROP POLICY IF EXISTS school_user_can_read_own_license ON public.licenses;
DO $$
BEGIN
  IF to_regclass('public.sync_outbox_log') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS sync_outbox_log_all ON public.sync_outbox_log';
  END IF;
END $$;
