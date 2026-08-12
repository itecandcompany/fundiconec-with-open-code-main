import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AppTabBar from "@/components/AppTabBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Avatar from "@/components/Avatar";
import EditProfileDialog from "@/components/EditProfileDialog";
import {
  LogOut,
  Shield,
  Phone,
  Mail,
  FileText,
  ChevronRight,
  Pencil,
  Star,
  Briefcase,
  Wallet,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { SERVICE_META, formatTsh, type ServiceKey } from "@/lib/geo";

export const Route = createFileRoute("/app/account")({
  ssr: false,
  component: Account,
});

type FundiStats = {
  service: ServiceKey;
  hourly_rate: number;
  rating: number;
  total_jobs: number;
};

function Account() {
  const t = useT();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [fundiStats, setFundiStats] = useState<FundiStats | null>(null);
  const [fundiLoading, setFundiLoading] = useState(false);

  const isFundi = profile?.role === "fundi";

  useEffect(() => {
    if (!isFundi || !user) return;
    setFundiLoading(true);
    supabase
      .from("fundis")
      .select("service, hourly_rate, rating, total_jobs")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFundiStats(data as FundiStats | null);
        setFundiLoading(false);
      });
  }, [isFundi, user]);

  if (!profile) return null;

  const memberSince = new Date(
    (user?.created_at as string | undefined) ?? Date.now(),
  ).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      <header className="border-b bg-background/90 backdrop-blur px-4 py-4 lg:px-8 lg:py-6">
        <h1 className="font-display text-2xl font-bold lg:text-3xl">{t("account.title")}</h1>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-2xl mx-auto lg:max-w-3xl lg:px-8 lg:py-6">
        <Card className="p-4 flex items-center gap-4">
          <Avatar url={profile.avatar_url} name={profile.full_name} size={56} />
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold text-lg leading-tight truncate">
              {profile.full_name}
            </div>
            <div className="text-xs text-muted-foreground capitalize">{profile.role}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t("account.memberSince", { date: memberSince })}
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("account.editProfile")}
            onClick={() => setEditOpen(true)}
            className="shrink-0"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </Card>

        <Card className="divide-y overflow-hidden p-0">
          <div className="flex items-center gap-3 px-4 py-3">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm truncate">{user?.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm truncate">{profile.phone ?? t("account.noPhone")}</span>
          </div>
        </Card>

        {isFundi && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold">{t("account.fundiProfile")}</h2>
              <Link
                to="/fundi/setup"
                className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
              >
                {t("account.editFundiProfile")}
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {fundiLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : fundiStats ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <Star className="h-4 w-4 mx-auto text-accent fill-accent" />
                  <div className="font-bold mt-1">{fundiStats.rating.toFixed(1)}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    {t("account.rating")}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <Briefcase className="h-4 w-4 mx-auto text-primary" />
                  <div className="font-bold mt-1">{fundiStats.total_jobs}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    {t("account.completedJobs")}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <Wallet className="h-4 w-4 mx-auto text-primary" />
                  <div className="font-bold mt-1 text-xs leading-tight">
                    {formatTsh(fundiStats.hourly_rate)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    {t("account.hourlyRate")}
                  </div>
                </div>
                <div className="col-span-3 flex items-center gap-2 rounded-xl bg-muted/50 p-3">
                  {(() => {
                    const meta = SERVICE_META[fundiStats.service];
                    return (
                      <>
                        <div
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                          style={{ background: meta.color + "22", color: meta.color }}
                        >
                          <meta.Icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium">{meta.label}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("account.fundiSetupIncomplete")}</p>
            )}
          </Card>
        )}

        <Card className="p-4">
          <LanguageSwitcher />
        </Card>

        <Card className="divide-y overflow-hidden p-0">
          <Link
            to="/privacy"
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm">{t("common.privacy")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
          {profile.role === "admin" && (
            <Link
              to="/admin"
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm">{t("account.adminConsole")}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          )}
        </Card>

        <Button
          variant="outline"
          className="w-full text-destructive"
          onClick={() => signOut().then(() => navigate({ to: "/" }))}
        >
          <LogOut className="h-4 w-4" /> {t("account.signOut")}
        </Button>
      </main>

      <EditProfileDialog profile={profile} open={editOpen} onOpenChange={setEditOpen} />
      <AppTabBar />
    </div>
  );
}
