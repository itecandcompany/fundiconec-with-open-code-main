import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import type { ServiceKey } from "@/lib/geo";
import type { ActiveJob } from "./ActiveJobLayer";

// LiveMap pulls in react-leaflet/leaflet, which touch `window` at module
// scope — importing it eagerly crashes SSR since the generated route tree
// statically imports every route module regardless of a route's own
// `ssr: false` option. TanStack Start's import-protection plugin enforces
// this at build time: it traces the *resolved* SSR module graph (not just
// source text), so neither a plain dynamic `import()` nor `import.meta.glob`
// escapes it on their own — both get flagged the same as a static import.
//
// `import.meta.env.SSR` is a build-time constant Vite substitutes per
// environment, so the `else` branch is provably unreachable in the SSR
// build and gets dead-code-eliminated before the import-protection plugin's
// module-graph check runs — the SSR bundle never resolves the glob at all.
// The client build takes the `true` branch, where `import.meta.glob` *is*
// statically analyzed by Vite and produces a correctly hashed chunk (unlike
// the old `import(/* @vite-ignore */ "./LiveMap.client")`, which also
// suppressed Vite's own rewriting — the browser ended up requesting the
// literal unhashed path in production, which never existed after build).
//
// The glob call itself has to live *inside* the branch, not hoisted above
// it — otherwise it's evaluated unconditionally at module scope and Rollup
// traces it into the SSR bundle regardless of which branch runs at runtime.
type LiveMapProps = {
  service: ServiceKey;
  setService: (s: ServiceKey) => void;
  hideIdleSheet?: boolean;
  onActiveJobChange?: (job: ActiveJob | null) => void;
};

const Inner = lazy(async (): Promise<{ default: ComponentType<LiveMapProps> }> => {
  // Signature must line up with the real module — `lazy()` infers `Inner`'s
  // prop type from the union of both branches' resolved component types.
  if (import.meta.env.SSR) return { default: () => null };
  const clientModules = import.meta.glob<typeof import("./LiveMap.client")>("./LiveMap.client.tsx");
  return clientModules["./LiveMap.client.tsx"]();
});

function Fallback() {
  return (
    <div className="h-full grid place-items-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  );
}

export default function LiveMap(props: LiveMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Fallback />;
  return (
    <Suspense fallback={<Fallback />}>
      <Inner {...props} />
    </Suspense>
  );
}
