import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AppTabBar from "@/components/AppTabBar";
import JobReceiptDialog from "@/components/JobReceiptDialog";
import { SERVICE_META, formatTsh, type ServiceKey } from "@/lib/geo";
import { STATUS_COLORS, type JobStatus } from "@/lib/jobStatus";
import { useT } from "@/lib/i18n";
import { Briefcase } from "lucide-react";

export const Route = createFileRoute("/app/jobs")({
  ssr: false,
  component: JobsHistory,
});

type JobRow = {
  id: string;
  service: ServiceKey;
  status: JobStatus;
  price: number;
  agreed_price: number | null;
  problem_title: string | null;
  created_at: string;
};

const ACTIVE_STATUSES: JobStatus[] = [
  "searching",
  "quoting",
  "accepted",
  "on_the_way",
  "arrived",
  "in_progress",
];

function JobsHistory() {
  const t = useT();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isFundi = profile?.role === "fundi";
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !profile) return;
    // A fundi's history is jobs they were hired for, not jobs they
    // requested — `client_id` (the original, client-only query) always
    // returned zero rows for a fundi, since a fundi is never its own
    // client. This silently looked like "no jobs" for every fundi.
    const column = isFundi ? "fundi_id" : "client_id";
    supabase
      .from("jobs")
      .select("id, service, status, price, agreed_price, problem_title, created_at")
      .eq(column, user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setJobs((data as JobRow[]) ?? []);
        setLoading(false);
      });
  }, [user, profile, isFundi]);

  const openJob = (job: JobRow) => {
    if (ACTIVE_STATUSES.includes(job.status)) {
      navigate({ to: "/app" });
    } else if (job.status === "completed") {
      setReceiptJobId(job.id);
    }
  };

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      <header className="border-b bg-background/90 backdrop-blur px-4 py-4 lg:px-8 lg:py-6">
        <h1 className="font-display text-2xl font-bold lg:text-3xl">{t("jobs.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t(isFundi ? "jobs.subtitleFundi" : "jobs.subtitle")}
        </p>
      </header>

      <main className="px-4 py-4 space-y-2 max-w-2xl mx-auto lg:max-w-5xl lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 lg:px-8 lg:py-6">
        {loading ? (
          <div className="contents" role="status" aria-busy="true" aria-label={t("common.loading")}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="p-3 flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </Card>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center lg:col-span-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted grid place-items-center mb-3">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-medium">{t("jobs.empty")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t(isFundi ? "jobs.emptyHintFundi" : "jobs.emptyHint")}
            </p>
          </div>
        ) : (
          jobs.map((job) => {
            const meta = SERVICE_META[job.service];
            return (
              <Card
                key={job.id}
                onClick={() => openJob(job)}
                className="p-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-secondary text-secondary-foreground">
                  <meta.Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {job.problem_title ?? meta.label}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[job.status]}`}
                    >
                      {t(`status.${job.status}`)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(job.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {formatTsh(
                      // Fundis keep 90% after the platform fee (matches the
                      // "Earnings (90%)" figure shown everywhere else on the
                      // fundi side, e.g. FundiLivePanel) — showing the full
                      // client-paid price here would overstate what they
                      // actually receive.
                      isFundi
                        ? Math.round((job.agreed_price ?? job.price) * 0.9)
                        : (job.agreed_price ?? job.price),
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </main>

      <JobReceiptDialog
        jobId={receiptJobId}
        open={!!receiptJobId}
        onOpenChange={(o) => !o && setReceiptJobId(null)}
        role={isFundi ? "fundi" : "client"}
      />
      <AppTabBar />
    </div>
  );
}
