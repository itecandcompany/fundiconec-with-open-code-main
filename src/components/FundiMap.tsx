import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import type { FundiMapJob } from "./FundiMap.client";

type FundiMapProps = {
  pos: [number, number] | null;
  active?: FundiMapJob | null;
  requests?: FundiMapJob[];
  height?: number;
};

// FundiMap.client pulls in react-leaflet/leaflet, which touch `window` at
// module scope — importing it eagerly crashes SSR since the generated route
// tree statically imports every route module regardless of a route's own
// `ssr: false` option. TanStack Start's import-protection plugin enforces
// this at build time by tracing the *resolved* module graph, so neither a
// plain dynamic `import()` nor `import.meta.glob` escapes it on their own.
//
// `import.meta.env.SSR` is a build-time constant Vite substitutes per
// environment, so the `else` branch below is provably unreachable in the
// SSR build and gets dead-code-eliminated before the import-protection
// plugin's check runs — the SSR bundle never resolves the glob at all. The
// client build takes the `import.meta.glob` branch, which Vite *does*
// statically analyze and hash correctly.
//
// This previously used `import(/* @vite-ignore */ variableSpecifier)` to
// dodge the import-protection scanner — but `@vite-ignore` also suppresses
// Vite's own rewriting, so the browser requested the literal unhashed path
// `/assets/FundiMap.client` in production, which only ever existed in dev.
// That request 404'd, the rejected lazy-load promise propagated to the
// nearest error boundary, and the whole app crashed for any fundi who went
// online (this component only mounts once `available || active` is true).
// Same bug, same fix as LiveMap.tsx.
const Inner = lazy(async (): Promise<{ default: ComponentType<FundiMapProps> }> => {
  if (import.meta.env.SSR) return { default: () => null };
  const clientModules = import.meta.glob<typeof import("./FundiMap.client")>(
    "./FundiMap.client.tsx",
  );
  return clientModules["./FundiMap.client.tsx"]();
});

export type { FundiMapJob };

export default function FundiMap(props: FundiMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const height = props.height ?? 260;
  if (!mounted) {
    return <div className="rounded-2xl overflow-hidden border bg-muted/30" style={{ height }} />;
  }
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl overflow-hidden border bg-muted/30" style={{ height }} />
      }
    >
      <Inner {...props} />
    </Suspense>
  );
}
