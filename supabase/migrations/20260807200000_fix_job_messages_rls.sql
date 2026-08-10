-- Same bug class as 20260807190000 (job_quotes): job_messages' SELECT/INSERT/
-- UPDATE policies query `jobs` directly in their USING/WITH CHECK, but an
-- unassigned fundi still browsing open requests (job.fundi_id IS NULL) has
-- no SELECT visibility into that jobs row since 20260612044300 hardened it
-- for privacy. Their EXISTS(...) subquery silently evaluates to false, so
-- an unassigned fundi's "Chat" button on an open request can neither load
-- nor send messages -- even though the INSERT policy's own WITH CHECK
-- conditions explicitly intend to allow exactly that case.
--
-- Add one SECURITY DEFINER helper (same pattern as has_role /
-- job_open_for_quoting) that captures "can this user message about this
-- job" and use it everywhere instead of raw subqueries against jobs.
CREATE OR REPLACE FUNCTION public.can_message_job(_job_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = _job_id
      AND (
        j.client_id = _uid
        OR j.fundi_id = _uid
        OR (
          j.status IN ('searching'::public.job_status, 'quoting'::public.job_status)
          AND public.has_role(_uid, 'fundi'::public.app_role)
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_message_job(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_message_job(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Participants view messages" ON public.job_messages;
CREATE POLICY "Participants view messages"
ON public.job_messages FOR SELECT TO authenticated
USING (
  public.can_message_job(job_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Participants send messages" ON public.job_messages;
CREATE POLICY "Participants send messages"
ON public.job_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.can_message_job(job_id, auth.uid())
);

DROP POLICY IF EXISTS "Recipient can mark message read" ON public.job_messages;
CREATE POLICY "Recipient can mark message read"
ON public.job_messages FOR UPDATE TO authenticated
USING (
  sender_id <> auth.uid()
  AND public.can_message_job(job_id, auth.uid())
)
WITH CHECK (
  sender_id <> auth.uid()
  AND public.can_message_job(job_id, auth.uid())
);
