import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AppTabBar from "@/components/AppTabBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LogOut, Shield, Phone, Mail, FileText, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/account")({
  ssr: false,
  component: Account,
});

function Account() {
  const t = useT();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  if (!profile) return null;

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      <header className="border-b bg-background/90 backdrop-blur px-4 py-4 lg:px-8 lg:py-6">
        <h1 className="font-display text-2xl font-bold lg:text-3xl">{t("account.title")}</h1>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-2xl mx-auto lg:max-w-3xl lg:px-8 lg:py-6">
        <Card className="p-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground grid place-items-center text-xl font-semibold shrink-0">
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-lg leading-tight truncate">
              {profile.full_name}
            </div>
            <div className="text-xs text-muted-foreground capitalize">{profile.role}</div>
          </div>
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

      <AppTabBar />
    </div>
  );
}
