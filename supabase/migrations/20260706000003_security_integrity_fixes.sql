-- =========================================================
-- Security & integrity fixes
-- =========================================================

-- ---------------------------------------------------------
-- 1) Restore EXECUTE on has_role for authenticated.
--    It was revoked in 20260428130730, which breaks every
--    RLS policy + trigger that calls it (permission denied).
-- ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

-- ---------------------------------------------------------
-- 2) guard_jobs_update: SECURITY DEFINER + financial integrity
--    -------------------------------------------------------
--    - Runs as owner so it can call has_role regardless of grants
--    - Clients cannot complete jobs, cannot change pricing,
--      and can only assign a fundi who actually quoted
--    - Fundis still cannot touch ownership/pricing fields
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_jobs_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- System transition: a fundi quotes an open job (no fundi assigned yet).
  -- Fired by bump_job_to_quoting_trg on job_quotes INSERT.
  IF OLD.fundi_id IS NULL AND NEW.fundi_id IS NULL
     AND OLD.status = 'searching' AND NEW.status = 'quoting'
     AND public.has_role(auth.uid(), 'fundi'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Client-initiated updates
  IF auth.uid() = OLD.client_id THEN
    -- Clients may never force a completion state
    IF NEW.status = 'completed'::job_status THEN
      RAISE EXCEPTION 'Only the assigned fundi can complete a job';
    END IF;

    -- fundi_id assignment is only allowed once, as part of accepting a quote
    IF NEW.fundi_id IS DISTINCT FROM OLD.fundi_id THEN
      IF NOT (
        OLD.fundi_id IS NULL
        AND NEW.fundi_id IS NOT NULL
        AND NEW.status = 'accepted'::job_status
        AND EXISTS (
          SELECT 1 FROM public.job_quotes q
          WHERE q.job_id = OLD.id AND q.fundi_id = NEW.fundi_id
        )
      ) THEN
        RAISE EXCEPTION 'Cannot reassign fundi directly';
      END IF;
      -- Price must match the quote the client is accepting
      IF NEW.price IS DISTINCT FROM (SELECT q.price FROM public.job_quotes q
                                     WHERE q.job_id = OLD.id AND q.fundi_id = NEW.fundi_id
                                     LIMIT 1)
         OR NEW.agreed_price IS DISTINCT FROM (SELECT q.price FROM public.job_quotes q
                                               WHERE q.job_id = OLD.id AND q.fundi_id = NEW.fundi_id
                                               LIMIT 1) THEN
        RAISE EXCEPTION 'Price must match the selected quote';
      END IF;
    ELSE
      -- No fundi assignment: pricing fields are locked for clients
      IF NEW.price IS DISTINCT FROM OLD.price
         OR NEW.commission IS DISTINCT FROM OLD.commission
         OR NEW.agreed_price IS DISTINCT FROM OLD.agreed_price THEN
        RAISE EXCEPTION 'Client cannot modify pricing fields';
      END IF;
    END IF;

    -- Clients may cancel, or accept a quote (fundi assignment above).
    -- Anything else (on_the_way / arrived / in_progress / completed) is fundi-only.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (NEW.status = 'cancelled' AND OLD.status NOT IN ('completed', 'cancelled'))
       AND NOT (NEW.status = 'accepted' AND OLD.status IN ('searching', 'quoting')
                AND OLD.fundi_id IS NULL AND NEW.fundi_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Client cannot change job status to %', NEW.status;
    END IF;

    RETURN NEW;
  END IF;

  -- Assigned fundi updates
  IF OLD.fundi_id IS NOT NULL AND auth.uid() = OLD.fundi_id THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.fundi_id IS DISTINCT FROM OLD.fundi_id
       OR NEW.price IS DISTINCT FROM OLD.price
       OR NEW.agreed_price IS DISTINCT FROM OLD.agreed_price
       OR NEW.commission IS DISTINCT FROM OLD.commission THEN
      RAISE EXCEPTION 'Fundi cannot modify protected job fields';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update job';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_jobs_update() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------
-- 3) Financial integrity CHECK constraints on jobs
-- ---------------------------------------------------------
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_price_nonneg;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_price_nonneg CHECK (price >= 0);
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_commission_nonneg;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_commission_nonneg CHECK (commission >= 0);
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_agreed_price_nonneg;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_agreed_price_nonneg CHECK (agreed_price IS NULL OR agreed_price >= 0);

-- ---------------------------------------------------------
-- 4) Tighten jobs INSERT: clients may only create their own
--    fresh 'searching' job with sane pricing and no fundi.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Clients create own jobs" ON public.jobs;
CREATE POLICY "Clients create own jobs"
ON public.jobs FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = client_id
  AND fundi_id IS NULL
  AND status = 'searching'::job_status
  AND price >= 0
  AND commission >= 0
);

-- ---------------------------------------------------------
-- 5) Prevent self-escalation via profiles.role
--    -----------------------------------------------------
--    RLS cannot compare OLD/NEW, so use a BEFORE UPDATE trigger.
--    Role changes are only allowed for admins or service role.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Cannot change role directly';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_update_trg ON public.profiles;
CREATE TRIGGER guard_profile_update_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- ---------------------------------------------------------
-- 6) Restore fundis SELECT for the marketplace.
--    The 20260613103645 tightening broke "find fundis near you"
--    (LiveMap) for clients browsing available fundis.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Authorized users can view fundis" ON public.fundis;
CREATE POLICY "Authorized users can view fundis"
ON public.fundis FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'client'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- ---------------------------------------------------------
-- 7) Restore profiles SELECT for authenticated users.
--    The counterparty-only policy broke fundi name lookups in
--    LiveMap, BookingSheet and admin pages.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Profiles viewable by self admin or counterparty" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- ---------------------------------------------------------
-- 8) Storage read policy: describe-step photos are uploaded to
--    {userId}/{ts}.{ext} (no job id). Allow fundis to read those
--    photos while the owner client has an open (searching/quoting) job.
--    Proof-of-work photos ({fundiId}/{jobId}/...) keep the
--    participant branch via folder[2] = job id.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Job photos readable by participants" ON storage.objects;
CREATE POLICY "Job photos readable by participants"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE (storage.foldername(name))[2] IS NOT NULL
        AND j.id::text = (storage.foldername(name))[2]
        AND (j.client_id = auth.uid() OR j.fundi_id = auth.uid())
    )
    OR (
      (storage.foldername(name))[2] IS NULL
      AND public.has_role(auth.uid(), 'fundi'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.client_id::text = (storage.foldername(name))[1]
          AND j.status IN ('searching'::job_status, 'quoting'::job_status)
      )
    )
  )
);
