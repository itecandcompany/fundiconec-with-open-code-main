import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import AppTabBar from "@/components/AppTabBar";
import { FileText, ChevronRight } from "lucide-react";
import { useT, type TKey } from "@/lib/i18n";

export const Route = createFileRoute("/app/help")({
  ssr: false,
  component: Help,
});

const FAQS: ReadonlyArray<{ q: TKey; a: TKey }> = [
  { q: "help.q1", a: "help.a1" },
  { q: "help.q2", a: "help.a2" },
  { q: "help.q3", a: "help.a3" },
  { q: "help.q4", a: "help.a4" },
];

function Help() {
  const t = useT();

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      <header className="border-b bg-background/90 backdrop-blur px-4 py-4 lg:px-8 lg:py-6">
        <h1 className="font-display text-2xl font-bold lg:text-3xl">{t("help.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("help.subtitle")}</p>
      </header>

      <main className="px-4 py-4 space-y-2 max-w-2xl mx-auto lg:max-w-5xl lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 lg:px-8 lg:py-6">
        {FAQS.map((f) => (
          <Card key={f.q} className="p-4">
            <div className="font-medium text-sm">{t(f.q)}</div>
            <p className="text-sm text-muted-foreground mt-1">{t(f.a)}</p>
          </Card>
        ))}

        <Card className="p-0 overflow-hidden mt-4 lg:col-span-2 lg:mt-0">
          <Link
            to="/privacy"
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm">{t("common.privacy")}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
        </Card>
      </main>

      <AppTabBar />
    </div>
  );
}
