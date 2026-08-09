/**
 * Zod-validated environment. Import `env` anywhere in the API — it is parsed
 * exactly once at module load and fails fast with a readable message.
 *
 * Every variable is documented in /.env.example. Ops output only (this file
 * never runs through the i18n catalog) — see CLAUDE.md's Ops-Ausgabe rule.
 */
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

/** Monorepo root (apps/api/src/env.ts -> ../../..). */
export const REPO_ROOT = resolve(import.meta.dir, "../../..");

/**
 * Bun only auto-loads .env from the current working directory, but the API is
 * started from apps/api. So we load the ROOT .env (and .env.local) ourselves —
 * existing process env always wins.
 */
function loadRootDotEnv(): void {
  // Never let a developer .env leak into `bun test` — tests use file::memory:
  // unless the test itself sets TEST_DATABASE_URL in process.env.
  if (process.env.NODE_ENV === "test") return;
  for (const file of [".env", ".env.local"]) {
    const path = join(REPO_ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1]!;
      if (process.env[key] !== undefined) continue;
      let value = match[2]!.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.env[key] = value;
    }
  }
}
loadRootDotEnv();

/** Resolves a relative `file:` DB path against the repo root, not the cwd. */
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const path = url.slice("file:".length);
  if (path.length === 0 || path.startsWith(":memory:") || isAbsolute(path)) return url;
  return `file:${resolve(REPO_ROOT, path)}`;
}

const BooleanishSchema = z
  .string()
  .transform((value) => value === "1" || value.toLowerCase() === "true")
  .optional();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    /** "file:./data/local.db" (self-hosted) or "libsql://xxx.turso.io" (Turso cloud). */
    DATABASE_URL: z.string().min(1, "DATABASE_URL is missing (e.g. file:./data/local.db)"),
    /** Only needed for remote libsql:// URLs. */
    DATABASE_AUTH_TOKEN: z.string().optional(),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /**
     * The interface locale a request falls back to when nothing more specific is
     * known: an unrecognised/absent `Accept-Language`. NOT the currency/number
     * formatting locale (that is always de-DE) — just the catalog fallback.
     */
    DEFAULT_LOCALE: z.enum(["de", "en"]).default("de"),
    /** Allowed browser origin(s) in development. Unused in the single-origin
     * Docker deployment, where there is no cross-origin request at all (see
     * CLAUDE.md decision 7 — no cors() call in src/index.ts). */
    WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

    PUBLIC_API_URL: z.string().optional(),

    /**
     * Directory of the built web app (`apps/web/dist`). When set, the API also
     * serves the PWA from its own port — which is how the Docker image runs, and
     * the reason a container needs no CORS and no API URL baked into the bundle
     * at build time. Unset in dev, where vite serves it.
     */
    WEB_DIST_DIR: z.string().optional(),

    /**
     * Outgoing mail (invite links, password reset). ALL OPTIONAL: with nothing
     * configured the API uses the ConsoleMailer, which logs the message
     * (including the link) and sends nothing — so `bun run dev` and `bun test`
     * never touch the network and an install without mail still boots.
     *
     * "console" (default) | "smtp" — no third-party mail API in this app.
     */
    MAIL_TRANSPORT: z.enum(["console", "smtp"]).optional(),
    /** Sender, "Name <address>" or a bare address. Required for MAIL_TRANSPORT=smtp. */
    MAIL_FROM: z.string().optional(),
    /** SMTP relay host. Required when MAIL_TRANSPORT=smtp ("mailpit" in compose). */
    MAIL_HOST: z.string().optional(),
    /** Defaults to 465 for MAIL_SECURITY=tls, otherwise 587. Mailpit listens on 1025. */
    MAIL_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    /** Omit both for a relay that does not authenticate (Mailpit). */
    MAIL_USER: z.string().optional(),
    MAIL_PASSWORD: z.string().optional(),
    /**
     * "starttls" (default) — plaintext greeting then a MANDATORY upgrade, port 587,
     * "tls"                — TLS from the first byte, port 465,
     * "none"               — plaintext, only defensible for a relay on the same
     *                        private network (Mailpit's case; refused below with
     *                        credentials set).
     */
    MAIL_SECURITY: z.enum(["starttls", "tls", "none"]).optional(),
    /** Accept a self-signed relay certificate. Off unless you know why you need it. */
    MAIL_TLS_INSECURE: BooleanishSchema,

    /** Optional: set to 1 to log every SQL statement. */
    DEBUG_SQL: BooleanishSchema,

    /**
     * Set to 1 ONLY when the API really sits behind a reverse proxy that
     * overwrites X-Forwarded-For (Caddy in the Docker stack). Without it the rate
     * limiter uses the socket address, because otherwise anyone could reset
     * their own login bucket by sending a fresh X-Forwarded-For header.
     */
    TRUST_PROXY: BooleanishSchema,
  })
  .transform((value) => {
    const isRemoteDb = /^(libsql|https|http|wss|ws):/i.test(value.DATABASE_URL);
    return {
      ...value,
      isProduction: value.NODE_ENV === "production",
      isTest: value.NODE_ENV === "test",
      /** Origins allowed by CORS in development, already split and trimmed. */
      webOrigins: value.WEB_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      /** "remote" for Turso cloud, "file" for a local libSQL file / memory DB. */
      databaseKind: (isRemoteDb ? "remote" : "file") as "remote" | "file",
      /** DATABASE_URL with relative file: paths resolved against the repo root. */
      databaseUrl: resolveDatabaseUrl(value.DATABASE_URL),
      /** Whether X-Forwarded-For / X-Real-IP may be believed (see TRUST_PROXY). */
      trustProxy: value.TRUST_PROXY === true,
      /** Which mail adapter services/mail/index.ts builds. Always "console" in tests. */
      mailTransport: (value.NODE_ENV === "test" ? "console" : (value.MAIL_TRANSPORT ?? "console")) as
        | "console"
        | "smtp",
      /** Sender address; the ConsoleMailer is happy with the placeholder. */
      mailFrom: value.MAIL_FROM ?? "Haushaltskasse <noreply@localhost>",
      /** How the SMTP session is encrypted; see MAIL_SECURITY. */
      mailSecurity: (value.MAIL_SECURITY ?? "starttls") as "starttls" | "tls" | "none",
      /** Submission port, defaulted from the chosen security rather than guessed. */
      mailPort: value.MAIL_PORT ?? (value.MAIL_SECURITY === "tls" ? 465 : 587),
      /** Absolute path of the built web app, or null when the API serves no UI. */
      webDistDir: value.WEB_DIST_DIR === undefined ? null : resolve(REPO_ROOT, value.WEB_DIST_DIR),
      /** The locale requestLocale(c) falls back to. See DEFAULT_LOCALE above. */
      defaultLocale: value.DEFAULT_LOCALE,
    };
  })
  .refine(
    (value) => value.databaseKind === "file" || (value.DATABASE_AUTH_TOKEN ?? "").length > 0,
    "DATABASE_AUTH_TOKEN is required for a remote libsql:// database",
  )
  .refine(
    (value) => value.mailTransport === "console" || (value.MAIL_FROM ?? "").length > 0,
    "MAIL_FROM is required for a real MAIL_TRANSPORT (a verified sender domain)",
  )
  .refine(
    (value) => value.mailTransport !== "smtp" || (value.MAIL_HOST ?? "").length > 0,
    'MAIL_HOST is required for MAIL_TRANSPORT=smtp (in the Docker stack: "mailpit")',
  )
  // Credentials over an unencrypted session would be readable by anything on the
  // path. The only setup that legitimately uses MAIL_SECURITY=none is a relay in
  // the same compose network, and that one needs no login — so this combination is
  // always a mistake, and it is one that looks like it works.
  .refine(
    (value) =>
      value.mailTransport !== "smtp" ||
      (value.MAIL_SECURITY ?? "starttls") !== "none" ||
      (value.MAIL_USER ?? "").length === 0,
    "MAIL_USER/MAIL_PASSWORD must not be combined with MAIL_SECURITY=none — the credentials would cross the network in cleartext (use MAIL_SECURITY=starttls or =tls)",
  );

export type Env = z.infer<typeof EnvSchema>;

/**
 * Test-friendly defaults so `bun test` works without any setup — and so a
 * developer .env (which Bun auto-loads from the cwd) can never point tests at
 * the real database.
 *
 * The default is a fresh TEMP FILE, not `file::memory:` — this is the ledger,
 * so its own test suite must not be the one thing that never exercises a real
 * transaction. `client.transaction()` opens a SECOND libSQL connection, and
 * for `file::memory:` that second connection is a brand-new, empty database:
 * everything written inside a transaction vanishes the moment it commits (see
 * `services/support.ts`'s `withTransaction` and docs/reference-architecture.md
 * §3.5). `bun test` runs every file in ONE process, and this module is a
 * singleton — so whichever DB URL is resolved here the FIRST time any test
 * file imports `env.ts` is what the entire run shares; a temp file is exactly
 * as safe to share across test files as `file::memory:` was.
 *
 * `TEST_DATABASE_URL` still overrides this (a fixed file across CI runs, or a
 * deliberately isolated case), but nothing has to set it for `bun test` to be
 * green out of the box, which is the whole point.
 */
function defaultTestDatabaseUrl(): string {
  return `file:${join(tmpdir(), `toon-finance-test-${crypto.randomUUID()}.db`)}`;
}

function rawEnv(): Record<string, string | undefined> {
  const source: Record<string, string | undefined> = {};
  // Empty strings in .env ("DATABASE_AUTH_TOKEN=") mean "not set", so that
  // .default()/.optional() kick in instead of failing a min(1) check.
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value.trim().length === 0) continue;
    source[key] = value;
  }
  if (source.NODE_ENV === "test") {
    source.DATABASE_URL = source.TEST_DATABASE_URL ?? defaultTestDatabaseUrl();
    source.DATABASE_AUTH_TOKEN = source.TEST_DATABASE_URL ? source.DATABASE_AUTH_TOKEN : undefined;
    source.SESSION_SECRET ??= "test-secret-test-secret-test-secret";
  }
  return source;
}

function loadEnv(): Env {
  const result = EnvSchema.safeParse(rawEnv());
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(env)";
      return `  - ${key}: ${issue.message}`;
    });
    const message = [
      "Invalid environment variables — check your .env (template: .env.example):",
      ...lines,
    ].join("\n");
    // Fail fast, no stack trace noise.
    console.error(message);
    process.exit(1);
  }
  return result.data;
}

export const env: Env = loadEnv();
