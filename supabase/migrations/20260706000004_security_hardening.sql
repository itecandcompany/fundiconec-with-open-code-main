-- =========================================================
-- Security hardening (closes remaining gaps)
--   1. Server-enforce commission + sane job INSERT (no client-picked commission)
--   2. Recompute commission whenever price changes (quote accept / admin)
--   3. Hard upper bounds on all job money fields
--   4. job-photos bucket is no longer public
--   5. Tighten profiles SELECT to relevant parties (stop global PII exposure)
-- =========================================================

-- ---------------------------------------------------------
-- 1) INSERT integrity: the client may only open a fresh
--    'searching' job for themselves with a positive price;
--    commission is ALWAYS recomputed server-side so a malicious
--    client cannot set commission = 0 or price = 1e18.
-- ---------------------------------------------------------
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

DROP TRIGGER IF EXISTS guard_jobs_insert_trg ON public.jobs;
CREATE TRIGGER guard_jobs_insert_trg
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_jobs_insert();

-- ---------------------------------------------------------
-- 2) Keep commission consistent with the charged price.
--    Runs alphabetically after guard_jobs_update_trg, so the
--    authorization checks happen first; this only reconciles
--    commission when price changes (e.g. quote acceptance),
--    so it never conflicts with the "no price edits" rules.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_jobs_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.commission := round(NEW.price * 0.10)::numeric(10,2);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_jobs_commission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_jobs_commission_trg ON public.jobs;
CREATE TRIGGER normalize_jobs_commission_trg
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.normalize_jobs_commission();

-- ---------------------------------------------------------
-- 3) Upper bounds on job money fields (in Tanzanian Shillings).
--    price is forced positive; agreed_price must be within cap.
-- ---------------------------------------------------------
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_price_max;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_price_max CHECK (price <= 100000000);

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_commission_max;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_commission_max CHECK (commission <= 100000000);

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_agreed_price_max;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_agreed_price_max CHECK (agreed_price IS NULL OR agreed_price <= 100000000);

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_price_positive;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_price_positive CHECK (price > 0);

-- ---------------------------------------------------------
-- 4) The job-photos bucket is referenced by signed URLs and its
--    objects are already gated by RLS SELECT policies. Leaving the
--    bucket public risks exposing every photo if a policy is ever
--    dropped, so mark it private (defense in depth).
-- ---------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'job-photos';

-- ---------------------------------------------------------
-- 5) Stop exposing the full profiles table to every authenticated
--    user. Visible only to: yourself, admins, fundis (for market
--    discovery), your job counterparty, or (for fundis) a client who
--    currently has an open searching/quoting job they may quote.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Profiles accessible to relevant parties"
ON public.profiles FOR SELECT TO authenticated
USING (
  profiles.id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  -- Any fundi profile is discoverable for market search / conductive quotes
  OR EXISTS (
    SELECT 1 FROM public.fundis f WHERE f.id = profiles.id
  )
  /* My assigned fundi, for the client side */
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.client_id = auth.uid() AND j.fundi_id = profiles.id
  )
  /* The client of a job assigned to me, for the fundi side */
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.fundi_id = auth.uid() AND j.client_id = profiles.id
  )
  /* A client who currently has an open job a fundi may quote */
  OR (
    public.has_role(auth.uid(), 'fundi'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.client_id = profiles.id
        AND j.status IN ('searching'::job_status, 'quoting'::job_status)
    )
  )
);