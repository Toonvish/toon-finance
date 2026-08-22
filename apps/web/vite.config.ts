import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Vite config for @toon/web.
 *
 *  - `envDir: "../../"`               -> the single .env lives in the monorepo root,
 *  - `envPrefix: ["VITE_","PUBLIC_"]` -> `import.meta.env.PUBLIC_API_URL` is inlined,
 *  - `@/*` + `@toon/shared` aliases mirror apps/web/tsconfig.json (paths, no baseUrl — TS 7),
 *  - `server.proxy` forwards `/api` to the API so the app can run same-origin in
 *    dev too (this repo has NO cors() call on the API at all — see CLAUDE.md
 *    decision 7 — so the proxy is the only way `/api/*` works from :5173).
 *  - `VitePWA` generates the service worker + web manifest. The precache/navigation
 *    fallback NEVER covers `/api` (see navigateFallbackDenylist), and `/api` is
 *    NEVER in runtimeCaching with a caching handler either: the offline copy of the
 *    ledger IS the persisted TanStack Query cache (lib/persist.ts, [OFFLINE]), and a
 *    service-worker cache hit for it would hand TanStack a stale body as if it were
 *    a fresh success — see docs/spec.md §5.4.1.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here("../../"), ["VITE_", "PUBLIC_", "API_"]);
  const apiTarget =
    env.PUBLIC_API_URL || env.VITE_API_URL || `http://localhost:${env.API_PORT || "3001"}`;

  return {
    root: here("."),
    envDir: "../../",
    envPrefix: ["VITE_", "PUBLIC_"],
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        // src/lib/pwa.ts registers `/sw.js` itself (production only, so a worker never
        // sits in front of the dev server and breaks HMR).
        injectRegister: false,
        filename: "sw.js",
        manifest: {
          id: "/",
          name: "toon-finance",
          short_name: "Finanzen",
          description: "Haushaltskasse für zwei: Ausgaben erfassen, aufteilen und ausgleichen.",
          lang: "de",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "any",
          background_color: "#f5f3ef",
          theme_color: "#f5f3ef",
          categories: ["finance", "productivity"],
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icons/maskable-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/icons/maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
          globIgnores: ["**/*.map"],
          navigateFallback: "/index.html",
          // NEVER serve the SPA shell for API calls. Unchanged, and it must stay
          // that way whatever runtimeCaching below does.
          navigateFallbackDenylist: [/^\/api\//],
          navigationPreload: false,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          // OFF on purpose — see docs/spec.md §5.4.1 / CLAUDE.md gotcha 12. A new
          // worker must wait for lib/pwa.ts to let it through, or a document still
          // running the old bundle gets a precache that no longer has its chunk.
          skipWaiting: false,
          runtimeCaching: [
            // AUSNAHMSLOS: /api never gets a caching handler, not even for GETs.
            { urlPattern: /\/api\//, handler: "NetworkOnly" },
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        "@": here("./src"),
        "@toon/shared": here("../../packages/shared/src/index.ts"),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: { "/api": { target: apiTarget, changeOrigin: false, secure: false } },
    },
    preview: {
      port: 4173,
      host: true,
      proxy: { "/api": { target: apiTarget, changeOrigin: false, secure: false } },
    },
    // sourcemap: false — a public map would let anyone with the deployed URL read
    // the entire TypeScript client source.
    build: { target: "es2022", sourcemap: false },
  };
});
