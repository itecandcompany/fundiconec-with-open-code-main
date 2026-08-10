import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_CENTER, SERVICE_META, haversineKm, type ServiceKey } from "@/lib/geo";
import { MapPin, ShieldCheck, Clock3, ChevronRight, Wrench, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

type LiveFundi = {
  full_name: string;
  service: ServiceKey;
  km: number;
};

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Partial<Record<ServiceKey, number>>>({});
  const [liveFundis, setLiveFundis] = useState<LiveFundi[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLiveLoading(true);
      const { data: rows } = await supabase
        .from("fundis")
        .select("id, service, current_lat, current_lng")
        .eq("is_available", true)
        .not("current_lat", "is", null)
        .not("current_lng", "is", null);
      const all = (rows ?? []) as {
        id: string;
        service: string;
        current_lat: number;
        current_lng: number;
      }[];
      const list = all.filter(
        (r): r is { id: string; service: ServiceKey; current_lat: number; current_lng: number } =>
          r.service in SERVICE_META,
      );
      const nextCounts: Partial<Record<ServiceKey, number>> = {};
      for (const r of list) nextCounts[r.service] = (nextCounts[r.service] ?? 0) + 1;
      const ids = list.map((r) => r.id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const profMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      const nearby = list
        .map((r) => ({
          full_name: profMap.get(r.id) ?? "Fundi",
          service: r.service,
          km: haversineKm(DEFAULT_CENTER, { lat: r.current_lat!, lng: r.current_lng! }),
        }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 5);
      if (cancelled) return;
      setCounts(nextCounts);
      setLiveFundis(nearby);
      setLiveLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const quickActions = (Object.keys(SERVICE_META) as ServiceKey[]).map((k) => ({
    Icon: SERVICE_META[k].Icon,
    color: SERVICE_META[k].color,
    label: SERVICE_META[k].label,
    count: counts[k] ?? 0,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/90 px-4 pb-4 pt-5 backdrop-blur supports-[padding:max(0px)]:pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-elegant">
                F
              </div>
              <div>
                <p className="font-display text-lg font-bold">FundiFast</p>
                <p className="text-xs text-muted-foreground">Dar es Salaam</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-5 px-4 py-4 pb-28">
          <section className="overflow-hidden rounded-[2rem] bg-gradient-hero p-5 text-primary-foreground shadow-elegant">
            <Badge className="mb-4 border-0 bg-background/15 text-primary-foreground hover:bg-background/15">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Trusted nearby fundis
            </Badge>
            <h1 className="max-w-xs text-3xl font-bold leading-tight">
              Book a fundi like you book a ride.
            </h1>
            <p className="mt-3 max-w-sm text-sm text-primary-foreground/85">
              Fast requests, live tracking, upfront pricing, and real people ready to help now.
            </p>
            <div className="mt-5 flex gap-3">
              <Link to="/auth" search={{ role: "client" }}>
                <Button size="lg" variant="secondary" className="h-12 rounded-2xl px-5">
                  Request now
                </Button>
              </Link>
              <Link to="/auth" search={{ role: "fundi" }}>
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12 rounded-2xl border border-primary-foreground/20 bg-background/10 px-5 text-primary-foreground hover:bg-background/15"
                >
                  Drive jobs
                </Button>
              </Link>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            {quickActions.map((item) => (
              <Link key={item.label} to="/auth" search={{ role: "client" }}>
                <Card className="rounded-3xl border-0 bg-card p-4 shadow-card transition-smooth active:scale-[0.98]">
                  <div
                    className="mb-4 grid h-12 w-12 place-items-center rounded-2xl"
                    style={{ background: item.color + "1a", color: item.color }}
                  >
                    <item.Icon className="h-6 w-6" />
                  </div>
                  <p className="font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.count > 0 ? `${item.count} online now` : "No one online right now"}
                  </p>
                </Card>
              </Link>
            ))}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Live around you</h2>
              <span className="text-xs text-muted-foreground">
                {liveLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  `${liveFundis.length} active`
                )}
              </span>
            </div>
            <Card className="overflow-hidden rounded-[1.75rem] border-0 p-0 shadow-card">
              <div className="bg-secondary px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <MapPin className="h-4 w-4 text-primary" /> Upanga, Dar es Salaam
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock3 className="h-4 w-4" /> 5–15 min
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-4">
                {liveLoading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3"
                      >
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-8" />
                      </div>
                    ))}
                  </div>
                ) : liveFundis.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-6 text-center">
                    <Wrench className="h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium">No fundis online right now</p>
                    <p className="text-xs text-muted-foreground">Check back in a few minutes.</p>
                  </div>
                ) : (
                  liveFundis.map((f) => {
                    const meta = SERVICE_META[f.service];
                    return (
                      <div
                        key={f.full_name + f.service}
                        className="flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3"
                      >
                        <div
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                          style={{ background: meta.color + "1a", color: meta.color }}
                        >
                          <meta.Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {f.full_name} · {meta.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Verified · {f.km.toFixed(1)} km away
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </section>
        </main>

        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="grid grid-cols-2 gap-3">
            <Link to="/auth" search={{ role: "client" }}>
              <Button className="h-13 w-full rounded-2xl bg-gradient-primary text-base shadow-elegant">
                Book a fundi
              </Button>
            </Link>
            <Link to="/auth" search={{ role: "fundi" }}>
              <Button variant="outline" className="h-13 w-full rounded-2xl text-base">
                Become a fundi
              </Button>
            </Link>
          </div>
          <div className="mt-2 text-center">
            <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
