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

// Kept in sync with AppTabBar's own h-[72px].
const TAB_BAR_HEIGHT = 72;

function AppHome() {
  const [service, setService] = useState<ServiceKey>("plumber");
  const [hasActive, setHasActive] = useState(false);
  const handleActiveJobChange = useCallback((job: ActiveJob | null) => {
    setHasActive(!!job);
  }, []);

  return (
    <div className="h-[100svh] w-full bg-background">
      <div
        className="relative w-full"
        style={{ height: hasActive ? "100%" : `calc(100svh - ${TAB_BAR_HEIGHT}px)` }}
      >
        <LiveMap
          service={service}
          setService={setService}
          onActiveJobChange={handleActiveJobChange}
        />
      </div>
      {!hasActive && <AppTabBar />}
    </div>
  );
}
