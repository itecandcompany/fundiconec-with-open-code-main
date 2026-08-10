import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Briefcase, HelpCircle, User } from "lucide-react";

const TABS = [
  { title: "Home", url: "/app", icon: Home, exact: true },
  { title: "Jobs", url: "/app/jobs", icon: Briefcase },
  { title: "Help", url: "/app/help", icon: HelpCircle },
  { title: "Account", url: "/app/account", icon: User },
] as const;

export default function AppTabBar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[72px] items-stretch justify-around border-t bg-background/95 backdrop-blur px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(13,18,17,0.08)]">
      {TABS.map((tab) => {
        const active = isActive(tab.url, "exact" in tab && tab.exact);
        return (
          <Link
            key={tab.url}
            to={tab.url}
            className="flex flex-1 max-w-[96px] flex-col items-center justify-center gap-1 rounded-lg transition-colors active:scale-95"
          >
            <div
              className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="h-5 w-5" />
            </div>
            <span
              className={`text-[11px] leading-none ${
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {tab.title}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
