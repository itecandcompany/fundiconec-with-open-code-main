import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SERVICE_META, type ServiceKey, formatTsh } from "@/lib/geo";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Star, Briefcase } from "lucide-react";
import { toUserMessage } from "@/lib/errorMessages";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/fundi/setup")({
  ssr: false,
  component: FundiSetup,
});

const SERVICES = Object.entries(SERVICE_META) as [ServiceKey, (typeof SERVICE_META)[ServiceKey]][];

function FundiSetup() {
  const t = useT();
  const { user, profile, loading } = useAuth();
  const userId = user?.id;
  const profileRole = profile?.role;
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceKey | null>(null);
  const [rate, setRate] = useState("15000");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  // Distinguishes first-time onboarding from editing an existing profile —
  // an existing fundi row means they've already set up before, so the
  // heading/copy and stats card below should reflect an edit, not onboarding.
  const [existing, setExisting] = useState<{ rating: number; total_jobs: number } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      navigate({ to: "/auth", search: { role: "fundi" } });
      return;
    }
    if (profileRole && profileRole !== "fundi") {
      navigate({ to: "/app" });
      return;
    }
    supabase
      .from("fundis")
      .select("service, hourly_rate, bio, rating, total_jobs")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setService(data.service as ServiceKey);
          setRate(String(data.hourly_rate));
          setBio(data.bio ?? "");
          setExisting({ rating: data.rating, total_jobs: data.total_jobs });
        }
        setHydrating(false);
      });
  }, [userId, profileRole, loading, navigate]);

  const submit = async () => {
    if (!user || !service) {
      toast.error(t("fundiSetup.pickService"));
      return;
    }
    const rateNum = Number(rate);
    if (!(rateNum > 0)) {
      toast.error(t("fundiSetup.invalidRate"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("fundis").upsert({
      id: user.id,
      service,
      hourly_rate: rateNum,
      bio: bio.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(toUserMessage(error));
      return;
    }
    toast.success(existing ? t("fundiSetup.savedEdit") : t("fundiSetup.savedNew"));
    navigate({ to: "/app" });
  };

  if (loading || hydrating) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <button
          onClick={() => navigate({ to: "/app" })}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> {t("fundiSetup.back")}
        </button>

        <div>
          <h1 className="font-display font-bold text-3xl">
            {existing ? t("fundiSetup.editTitle") : t("fundiSetup.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("fundiSetup.subtitle")}</p>
        </div>

        {existing && (
          <Card className="p-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <Star className="h-4 w-4 mx-auto text-accent fill-accent" />
              <div className="font-bold mt-1">{existing.rating.toFixed(1)}</div>
              <div className="text-[10px] text-muted-foreground uppercase">
                {t("account.rating")}
              </div>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <Briefcase className="h-4 w-4 mx-auto text-primary" />
              <div className="font-bold mt-1">{existing.total_jobs}</div>
              <div className="text-[10px] text-muted-foreground uppercase">
                {t("account.completedJobs")}
              </div>
            </div>
          </Card>
        )}

        <Card className="p-5 space-y-3">
          <Label className="text-sm font-semibold">{t("fundiSetup.serviceCategory")}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SERVICES.map(([key, meta]) => {
              const active = service === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setService(key)}
                  className={`rounded-2xl border-2 p-4 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div
                    className="h-11 w-11 rounded-xl grid place-items-center"
                    style={{ background: meta.color + "22", color: meta.color }}
                  >
                    <meta.Icon className="h-5 w-5" />
                  </div>
                  <div className="font-semibold mt-2">{meta.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("fundiSetup.avgPrice", { price: formatTsh(meta.price) })}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div>
            <Label htmlFor="rate">{t("fundiSetup.hourlyRate")}</Label>
            <Input
              id="rate"
              type="number"
              inputMode="numeric"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div>
            <Label htmlFor="bio">{t("fundiSetup.bio")}</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder={t("fundiSetup.bioPlaceholder")}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </Card>

        <Button
          onClick={submit}
          disabled={busy || !service}
          className="w-full h-12 bg-gradient-primary"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : existing ? (
            t("common.submit")
          ) : (
            t("fundiSetup.saveContinue")
          )}
        </Button>
      </div>
    </div>
  );
}
