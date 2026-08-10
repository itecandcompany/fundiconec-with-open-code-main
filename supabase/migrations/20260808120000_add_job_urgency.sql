-- Adds an urgency field to jobs (Now / Today / Schedule), matching the
-- FundiGo design prototype's "When do you need it?" picker. Defaults to
-- 'now' so existing rows and any insert that omits it keep today's behavior.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'now'
  CHECK (urgency IN ('now', 'today', 'schedule'));
