import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ServiceKey } from "@/lib/geo";
import type { ActiveJob } from "./ActiveJobLayer";

// Use a variable specifier so the server-side import-protection plugin
// (which scans static imports of **/*.client.*) doesn't flag this module.
// LiveMap pulls in react-leaflet/leaflet, which touch `window` at module
// scope — importing it eagerly crashes SSR since the generated route tree
// statically imports every route module regardless of a route's own
// `ssr: false` option.
const Inner = lazy(() => {
  const m = "./LiveMap.client";
  return import(/* @vite-ignore */ m);
});

function Fallback() {
  return (
    <div className="h-full grid place-items-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  );
}

export default function LiveMap(props: {
  service: ServiceKey;
  setService: (s: ServiceKey) => void;
  hideIdleSheet?: boolean;
  onActiveJobChange?: (job: ActiveJob | null) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Fallback />;
  return (
    <Suspense fallback={<Fallback />}>
      <Inner {...props} />
    </Suspense>
  );
}
