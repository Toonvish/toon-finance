/**
 * toon-finance API — Bun.serve + Hono. Mount order is the content
 * (docs/spec.md §5.3.1) — do not reorder without re-reading it.
 *
 * No `cors()` call: this is a single-origin deployment (decision #7 in
 * CLAUDE.md) — the API serves the built PWA itself in production, and in
 * development the Vite dev server proxies `/api` to this port instead of
 * making a cross-origin request.
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { dbReady } from "./db/client.ts";
import { env } from "./env.ts";
import { notFoundHandler, onErrorHandler } from "./lib/errors.ts";
import { localeMiddleware } from "./lib/locale.ts";
import type { AppEnv } from "./lib/types.ts";
import { webAppMiddleware } from "./middleware/staticWeb.ts";
import { authRoutes } from "./routes/auth.ts";
import { balanceRoutes } from "./routes/balance.ts";
import { categoryRoutes } from "./routes/categories.ts";
import { householdsRoutes } from "./routes/households.ts";
import { planRoutes } from "./routes/plan.ts";
import { settlementRoutes } from "./routes/settlements.ts";
import { tagRoutes } from "./routes/tags.ts";
import { transactionRoutes } from "./routes/transactions.ts";
import { runBootCatchUp, startAccrualScheduler } from "./services/plan/scheduler.ts";

export const app = new Hono<AppEnv>();

// 1. Error envelope: `{ error: { code, message, details? } }` (docs/spec.md
// §3.1). `onErrorHandler`/`notFoundHandler` read `requestLocale(c)`, which
// falls back to `env.defaultLocale` when `localeMiddleware` (mounted below)
// has not run yet — these two can fire before any `app.use("*")` does.
app.onError(onErrorHandler);
app.notFound(notFoundHandler);

// 2. Never under `bun test`: a logger writing to stdout for every assertion
// would drown the test output, and (CLAUDE.md gotcha #19) it would also be
// the reason a session id must never appear in a URL.
if (!env.isTest) app.use("*", logger());

// 3. Accept-Language negotiation, before every router — see lib/locale.ts.
app.use("*", localeMiddleware);

/**
 * Liveness/readiness probe. No session required, never cached by the service
 * worker (`/api/` is NetworkOnly in apps/web/vite.config.ts's runtimeCaching),
 * so the answer is always the running server's.
 */
app.get("/api/health", (c) =>
  c.json({
    status: "ok" as const,
    version: process.env.npm_package_version ?? "0.1.0",
    time: new Date().toISOString(),
    database: env.databaseKind,
    mail: env.mailTransport,
  }),
);

// 4. Feature routers, in the binding order from docs/spec.md §5.3.1.
app.route("/api/auth", authRoutes);
app.route("/api/households", householdsRoutes); // invites routes BEFORE /:householdId (see routes/households.ts)

// [API-DOMÄNE]: transactions, categories, tags, plan, balance, settlements —
// in exactly this order (docs/spec.md §5.3.1). Each router brings its own
// `router.use("*", requireSession())` + `router.use("*", requireHousehold())`
// (middleware/household.ts) — never an inline membership check in a handler.
app.route("/api/households/:householdId/transactions", transactionRoutes); // /summary BEFORE /:transactionId, see routes/transactions.ts
app.route("/api/households/:householdId/categories", categoryRoutes);
app.route("/api/households/:householdId/tags", tagRoutes);
app.route("/api/households/:householdId/plan", planRoutes);
app.route("/api/households/:householdId/balance", balanceRoutes);
app.route("/api/households/:householdId/settlements", settlementRoutes);

// 5. GANZ zuletzt: owns the SPA fallback, so every other route must see the
// request first. Only mounted when the API also serves the built PWA
// (WEB_DIST_DIR unset in development, where vite serves it instead).
if (env.webDistDir !== null) app.use("*", webAppMiddleware(env.webDistDir));

if (!env.isTest) {
  await dbReady;
  // The fixed-cost plan's boot catch-up (docs/spec.md §3.7): once, AFTER
  // migrations, BEFORE the server accepts traffic — awaited here so a
  // request never races an empty ledger that is about to gain five months
  // of bookings. The repeating 6-hour tick starts right after; both funnel
  // through the same `runCatchUp`, so they can never disagree about what
  // "already booked" means (services/plan/scheduler.ts).
  await runBootCatchUp();
  startAccrualScheduler();
  console.log(
    `[api] toon-finance API on http://localhost:${env.API_PORT} (db: ${env.databaseKind}, mail: ${env.mailTransport}, web: ${env.webDistDir ?? "extern"})`,
  );
}

export default {
  port: env.API_PORT,
  fetch: app.fetch,
  maxRequestBodySize: 20 * 1024 * 1024,
};
