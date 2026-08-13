import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import FundiLivePanel from "@/components/FundiLivePanel";
import AppTabBar from "@/components/AppTabBar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app")({ component: AppLayout });

function AppLayout() {
  const { user, profile, loading } = useAuth();
  const userId = user?.id;
  const profileRole = profile?.role;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [fundiChecked, setFundiChecked] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { role: "client" } });
  }, [user, loading, navigate]);

  // For fundis: if no fundis row exists, push to setup
  useEffect(() => {
    if (loading || !userId || !profileRole || profileRole !== "fundi") return;
    supabase
      .from("fundis")
      .select("id")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setFundiChecked(true);
        if (!data) navigate({ to: "/fundi/setup" });
      });
  }, [userId, profileRole, loading, navigate]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    );
  }

  const isFundi = profile.role === "fundi";

  if (isFundi) {
    if (!fundiChecked) {
      return (
        <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
      );
    }
    // The fundi dashboard below owns the exact "/app" path. Any deeper
    // route (e.g. /app/jobs, /app/account) needs to actually render, not be
    // replaced by the dashboard every time — hand off to the matched child
    // route. AppTabBar is what makes those routes reachable at all: it's
    // the only nav a fundi has (Home/Jobs/Help/Account), same component the
    // client side already uses.
    if (pathname !== "/app") {
      return <Outlet />;
    }
    return (
      <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 lg:px-8 lg:py-6">
          <FundiLivePanel />
        </main>
        <AppTabBar />
      </div>
    );
  }

  return <Outlet />;
}
