// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Outside a Lovable sandbox, this wrapper's nitro/deploy step is skipped
  // entirely by default, which leaves a plain Node server.js that Vercel's
  // platform doesn't know how to route (hence 404 NOT_FOUND on every page).
  // Setting an explicit preset here forces the deploy build to run and emit
  // Vercel's own `.vercel/output/` function structure instead of Cloudflare's.
  //
  // `serverEntry` matters too: without it, nitro can't find a server entry
  // (it only auto-detects conventional files like server.ts, and TanStack
  // Start's SSR build doesn't produce one — it registers as a Vite "ssr"
  // environment instead). Nitro then silently falls back to serving the raw
  // public/index.html for every route via its static "renderer" fallback,
  // which looks like a working 200 response but is actually just the
  // unbuilt template — hydration never happens, so the page stays blank.
  nitro: {
    preset: "vercel",
  },
  vite: {
    ssr: {
      target: "node",
      noExternal: [],
    },
    build: {
      sourcemap: false,
    },
  },
});
