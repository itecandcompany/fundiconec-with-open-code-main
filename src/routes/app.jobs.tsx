import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import AppTabBar from "@/components/AppTabBar";
import JobReceiptDialog from "@/components/JobReceiptDialog";
import { SERVICE_META, formatTsh, type ServiceKey } from "@/lib/geo";
import { STATUS_COLORS, type JobStatus } from "@/lib/jobStatus";
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("jobs")
      .select("id, service, status, price, agreed_price, problem_title, created_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setJobs((data as JobRow[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  const openJob = (job: JobRow) => {
    if (ACTIVE_STATUSES.includes(job.status)) {
      navigate({ to: "/app" });
    } else if (job.status === "completed") {
      setReceiptJobId(job.id);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background pb-24">
      <header className="border-b bg-background/90 backdrop-blur px-4 py-4">
        <h1 className="font-display text-2xl font-bold">Your jobs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Everything you've requested, past and present.
        </p>
      </header>

      <main className="px-4 py-4 space-y-2 max-w-2xl mx-auto">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted grid place-items-center mb-3">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-medium">No jobs yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Request a fundi from the Home tab to get started.
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
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLORS[job.status]}`}
                    >
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(job.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {formatTsh(job.agreed_price ?? job.price)}
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
        role="client"
      />
      <AppTabBar />
    </div>
  );
}
