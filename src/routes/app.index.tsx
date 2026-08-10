import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import LiveMap from "@/components/LiveMap";
import AppTabBar from "@/components/AppTabBar";
import type { ActiveJob } from "@/components/ActiveJobLayer";
import type { ServiceKey } from "@/lib/geo";

export const Route = createFileRoute("/app/")({
  ssr: false,
  component: AppHome,
});

function AppHome() {
  const [service, setService] = useState<ServiceKey>("plumber");
  const [hasActive, setHasActive] = useState(false);
  const handleActiveJobChange = useCallback((job: ActiveJob | null) => {
    setHasActive(!!job);
  }, []);

  return (
    <div className="h-[var(--app-100vh)] w-full bg-background">
      {/* Phone/tablet: a centred column above the bottom tab bar.
          Desktop: full width, offset by the sidebar rail. */}
      <div className="relative mx-auto h-full w-full max-w-2xl lg:max-w-none lg:pl-60">
        <div
          className={`relative w-full ${
            hasActive ? "h-full" : "h-[calc(var(--app-100vh)-var(--app-tabbar-h))]"
          }`}
        >
          <LiveMap
            service={service}
            setService={setService}
            onActiveJobChange={handleActiveJobChange}
          />
        </div>
        {/* An active job takes over the phone screen (the tab bar would crowd
            the tracking sheet), but on desktop the sidebar must stay put —
            the layout reserves a 240px gutter for it either way. */}
        <div className={hasActive ? "hidden lg:block" : "block"}>
          <AppTabBar />
        </div>
      </div>
    </div>
  );
}
