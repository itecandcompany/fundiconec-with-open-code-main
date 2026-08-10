-- Fundis lost direct SELECT visibility into unassigned "searching" jobs
-- when 20260612044300 hardened the jobs table (hides precise client
-- location from unassigned fundis; open jobs are meant to be browsed only
-- through list_open_jobs_for_fundi() / the service-role server function).
-- The job_quotes INSERT/UPDATE policies were never updated to match, so
-- their WITH CHECK subqueries against `jobs` silently fail RLS for any
-- fundi quoting an open job -- no fundi has ever been able to submit a
-- quote since that migration. Add a SECURITY DEFINER helper (same pattern
-- as has_role) so the check can see job status without granting raw table
-- access back to fundis.
CREATE OR REPLACE FUNCTION public.job_open_for_quoting(_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = _job_id AND j.status IN ('searching'::public.job_status, 'quoting'::public.job_status)
  )
$$;

REVOKE ALL ON FUNCTION public.job_open_for_quoting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.job_open_for_quoting(uuid) TO authenticated;

DROP POLICY IF EXISTS "Fundi creates quote" ON public.job_quotes;
CREATE POLICY "Fundi creates quote" ON public.job_quotes
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = fundi_id
  AND public.has_role(auth.uid(), 'fundi'::public.app_role)
  AND public.job_open_for_quoting(job_id)
);

DROP POLICY IF EXISTS "Quote owner or client updates" ON public.job_quotes;
CREATE POLICY "Quote owner or client updates"
ON public.job_quotes
FOR UPDATE
TO authenticated
USING (
  (fundi_id = auth.uid() AND public.job_open_for_quoting(job_id))
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_quotes.job_id AND j.client_id = auth.uid()
  )
)
WITH CHECK (
  (fundi_id = auth.uid() AND public.job_open_for_quoting(job_id))
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_quotes.job_id AND j.client_id = auth.uid()
  )
);
