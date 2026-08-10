import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Briefcase, HelpCircle, User } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";

const TABS = [
  { key: "nav.home", url: "/app", icon: Home, exact: true },
  { key: "nav.jobs", url: "/app/jobs", icon: Briefcase },
  { key: "nav.help", url: "/app/help", icon: HelpCircle },
  { key: "nav.account", url: "/app/account", icon: User },
] as const satisfies ReadonlyArray<{
  key: TKey;
  url: string;
  icon: typeof Home;
  exact?: boolean;
}>;

/**
 * Primary navigation. Two shapes from one element:
 *   - phone/tablet: bottom tab bar, thumb-reachable, centred with the content column
 *   - desktop (lg+): left sidebar rail, so the app uses the screen instead of
 *     stranding a phone-width column in the middle of a wide monitor
 */
export default function AppTabBar() {
  const t = useT();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[72px] w-full max-w-2xl items-stretch justify-around border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur shadow-[0_-4px_20px_rgba(13,18,17,0.08)] lg:inset-y-0 lg:right-auto lg:mx-0 lg:h-auto lg:w-60 lg:max-w-none lg:flex-col lg:justify-start lg:gap-1 lg:border-t-0 lg:border-r lg:px-3 lg:py-6 lg:shadow-none"
    >
      <Link
        to="/app"
        className="hidden lg:mb-4 lg:flex lg:items-center lg:gap-3 lg:px-3"
        aria-label="FundiFast home"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-elegant">
          F
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold leading-none">FundiFast</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">Dar es Salaam</p>
        </div>
      </Link>

      {TABS.map((tab) => {
        const active = isActive(tab.url, "exact" in tab && tab.exact);
        return (
          <Link
            key={tab.url}
            to={tab.url}
            aria-current={active ? "page" : undefined}
            aria-label={t(tab.key)}
            className="flex max-w-[96px] flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors active:scale-95 lg:max-w-none lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 lg:hover:bg-muted"
          >
            <div
              className={`grid h-8 w-12 place-items-center rounded-full transition-colors lg:h-9 lg:w-9 ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="h-5 w-5" />
            </div>
            <span
              className={`text-[11px] leading-none lg:text-sm ${
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {t(tab.key)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
