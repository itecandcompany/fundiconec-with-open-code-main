import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SERVICE_META, formatTsh, type ServiceKey } from "@/lib/geo";
import { Search, Star, Ban, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errorMessages";
import { adminSetUserRole, adminSetUserSuspended } from "@/lib/adminUsers.functions";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

type AppRole = "client" | "fundi" | "admin";

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: AppRole;
  is_suspended: boolean;
  created_at: string;
};
type Fundi = {
  id: string;
  service: ServiceKey;
  hourly_rate: number;
  is_available: boolean;
  rating: number;
  total_jobs: number;
};

const ROLES: AppRole[] = ["client", "fundi", "admin"];

// Server functions throw a Response for expected, already-friendly failures
// (e.g. "Cannot remove the last admin") — surface that text directly instead
// of falling back to a generic message.
async function serverFnErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (err instanceof Response) {
    const text = await err.text().catch(() => "");
    return text || fallback;
  }
  return toUserMessage(err, fallback);
}

function AdminUsers() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [fundis, setFundis] = useState<Record<string, Fundi>>({});
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "client" | "fundi" | "admin">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const setUserRole = useServerFn(adminSetUserRole);
  const setUserSuspended = useServerFn(adminSetUserSuspended);

  const load = async () => {
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("fundis").select("*"),
    ]);
    setProfiles((p as Profile[]) ?? []);
    const map: Record<string, Fundi> = {};
    for (const r of (f as Fundi[]) ?? []) map[r.id] = r;
    setFundis(map);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return profiles.filter((p) => {
      if (tab !== "all" && p.role !== tab) return false;
      if (!ql) return true;
      return p.full_name.toLowerCase().includes(ql) || (p.phone ?? "").toLowerCase().includes(ql);
    });
  }, [profiles, q, tab]);

  const counts = useMemo(() => {
    const c = { all: profiles.length, client: 0, fundi: 0, admin: 0 };
    for (const p of profiles) c[p.role]++;
    return c;
  }, [profiles]);

  const changeRole = async (target: Profile, role: AppRole) => {
    if (role === target.role) return;
    setBusyId(target.id);
    try {
      await setUserRole({ data: { targetUserId: target.id, role } });
      setProfiles((prev) => prev.map((p) => (p.id === target.id ? { ...p, role } : p)));
      toast.success(`${target.full_name} is now ${role}`);
    } catch (err) {
      toast.error(await serverFnErrorMessage(err, "Unable to update role"));
    } finally {
      setBusyId(null);
    }
  };

  const toggleSuspended = async (target: Profile) => {
    const suspended = !target.is_suspended;
    setBusyId(target.id);
    try {
      await setUserSuspended({ data: { targetUserId: target.id, suspended } });
      setProfiles((prev) =>
        prev.map((p) => (p.id === target.id ? { ...p, is_suspended: suspended } : p)),
      );
      toast.success(suspended ? `${target.full_name} suspended` : `${target.full_name} reinstated`);
    } catch (err) {
      toast.error(await serverFnErrorMessage(err, "Unable to update account status"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Users & Fundis</h1>
        <p className="text-sm text-muted-foreground">
          Browse everyone on the platform, change roles, or suspend an account.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "client", "fundi", "admin"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm border transition-colors capitalize ${
              tab === t
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-background"
            }`}
          >
            {t} <span className="opacity-70">({counts[t]})</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone…"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="divide-y">
          {filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">No users found.</div>
          )}
          {filtered.map((p) => {
            const f = fundis[p.id];
            const fundiMeta = f ? SERVICE_META[f.service] : null;
            const isSelf = p.id === user?.id;
            const busy = busyId === p.id;
            return (
              <div
                key={p.id}
                className="flex flex-col gap-3 p-3 md:p-4 hover:bg-muted/40 sm:flex-row sm:items-center"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center font-semibold shrink-0">
                  {p.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{p.full_name}</div>
                    <Badge
                      variant={
                        p.role === "admin"
                          ? "default"
                          : p.role === "fundi"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-[10px]"
                    >
                      {p.role}
                    </Badge>
                    {p.is_suspended && (
                      <Badge variant="destructive" className="text-[10px]">
                        Suspended
                      </Badge>
                    )}
                    {fundiMeta && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <fundiMeta.Icon className="h-3 w-3" />
                        {fundiMeta.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.phone ?? "No phone"} · joined {new Date(p.created_at).toLocaleDateString()}
                  </div>
                  {f && (
                    <div className="text-xs text-muted-foreground mt-0.5 sm:hidden">
                      <Star className="inline h-3 w-3 fill-accent text-accent -mt-0.5" />{" "}
                      {Number(f.rating).toFixed(1)} · {f.total_jobs} jobs ·{" "}
                      {formatTsh(f.hourly_rate)}/hr
                    </div>
                  )}
                </div>
                {f && (
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="flex items-center gap-1 text-sm justify-end">
                      <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                      {Number(f.rating).toFixed(1)}
                      <span className="text-muted-foreground">· {f.total_jobs} jobs</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTsh(f.hourly_rate)}/hr ·{" "}
                      <span className={f.is_available ? "text-success" : "text-muted-foreground"}>
                        {f.is_available ? "Online" : "Offline"}
                      </span>
                    </div>
                  </div>
                )}
                {isSelf ? (
                  <div className="text-xs text-muted-foreground shrink-0 sm:w-64 text-right">
                    This is you
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0 sm:w-64 sm:justify-end">
                    <select
                      className="rounded-md border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                      value={p.role}
                      disabled={busy}
                      onChange={(e) => changeRole(p, e.target.value as AppRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant={p.is_suspended ? "outline" : "ghost"}
                      className={p.is_suspended ? "" : "text-destructive"}
                      disabled={busy}
                      onClick={() => toggleSuspended(p)}
                    >
                      {p.is_suspended ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Reinstate
                        </>
                      ) : (
                        <>
                          <Ban className="h-3.5 w-3.5 mr-1" /> Suspend
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
