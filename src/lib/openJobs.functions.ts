import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceEmailConfirmed } from "@/lib/auth.server";

// Simple in-memory sliding window rate limiter keyed by caller.
// Best-effort against an individual abusing the endpoint; does not
// require any shared store, so it is safe in stateless deployments.
const WINDOW_MS = 60_000;
const MAX_CALLS = 30;
const lastCalls = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (lastCalls.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) {
    lastCalls.set(userId, recent);
    return true;
  }
  recent.push(now);
  lastCalls.set(userId, recent);
  return false;
}

export const getOpenJobsForFundi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, enforceEmailConfirmed])
  .handler(async ({ context }) => {
    if (isRateLimited(context.userId)) {
      throw new Response("Too many requests", { status: 429 });
    }
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "fundi")
      .maybeSingle();

    if (!role) throw new Response("Forbidden", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fundi, error: fundiError } = await supabaseAdmin
      .from("fundis")
      .select("service")
      .eq("id", context.userId)
      .maybeSingle();

    if (fundiError) throw new Error("Unable to load fundi profile");
    if (!fundi) return [];

    const { data, error } = await supabaseAdmin
      .from("jobs")
      .select(
        "id, client_id, fundi_id, service, status, client_lat, client_lng, price, agreed_price, problem_title, problem_description, job_photos, urgency, created_at",
      )
      .eq("service", fundi.service)
      .in("status", ["searching", "quoting"])
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) throw new Error("Unable to load open jobs");
    return (data ?? []).map((job) => ({
      ...job,
      client_lat: Math.round(job.client_lat * 100) / 100,
      client_lng: Math.round(job.client_lng * 100) / 100,
    }));
  });
