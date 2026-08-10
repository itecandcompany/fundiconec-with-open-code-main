import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import AppTabBar from "@/components/AppTabBar";
import { FileText, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/app/help")({
  ssr: false,
  component: Help,
});

const FAQS = [
  {
    q: "How do I request a fundi?",
    a: "From the Home tab, pick a service, describe the problem, and set a budget. Nearby fundis will send you quotes — accept one and they'll head your way.",
  },
  {
    q: "How is pricing decided?",
    a: "You set a budget when you request a job. Fundis quote against it, and you pick the quote you're happiest with before any work starts. FundiFast takes a 10% platform fee from the agreed price.",
  },
  {
    q: "Can I message or call my fundi?",
    a: "Yes — once a fundi is assigned, Chat and Call are available on the tracking screen for the whole job.",
  },
  {
    q: "How do I cancel a request?",
    a: 'While a job is active, use "Cancel request" on the tracking screen. You\'ll be asked for a short reason, which is shared with the other side.',
  },
];

function Help() {
  return (
    <div className="min-h-[100svh] bg-background pb-24">
      <header className="border-b bg-background/90 backdrop-blur px-4 py-4">
        <h1 className="font-display text-2xl font-bold">Help</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Answers to common questions.</p>
      </header>

      <main className="px-4 py-4 space-y-2 max-w-2xl mx-auto">
        {FAQS.map((f) => (
          <Card key={f.q} className="p-4">
            <div className="font-medium text-sm">{f.q}</div>
            <p className="text-sm text-muted-foreground mt-1">{f.a}</p>
          </Card>
        ))}

        <Card className="p-0 overflow-hidden mt-4">
          <Link
            to="/privacy"
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm">Privacy Policy</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
        </Card>
      </main>

      <AppTabBar />
    </div>
  );
}
