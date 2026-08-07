-- =========================================================
-- Admin user management support
--   1. is_suspended flag on profiles (display + defense-in-depth;
--      real enforcement is an auth-level ban set via the admin API)
--   2. guard_profile_update: allow the trusted service_role
--      connection to change role (used by the admin server function,
--      which independently verifies the caller is an admin before
--      ever using the service role key). auth.uid() is NULL for
--      service_role connections, so the existing check blocked this
--      even for legitimate server-side admin actions.
--   3. guard_jobs_insert: reject new jobs from a suspended client,
--      in case their existing access token is still valid.
-- =========================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Cannot change role directly';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_jobs_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to create a job';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended
  ) THEN
    RAISE EXCEPTION 'Your account has been suspended';
  END IF;

  IF NEW.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Clients may only create their own jobs';
  END IF;

  -- A job is always created unassigned, in the searching state.
  NEW.fundi_id := NULL;
  NEW.status := 'searching'::job_status;

  -- Commission is not a client input: enforce the platform rate.
  NEW.commission := round(NEW.price * 0.10)::numeric(10,2);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_jobs_insert() FROM PUBLIC, anon, authenticated;
