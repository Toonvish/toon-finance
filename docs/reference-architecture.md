# Referenz-Architektur: was toon-finance von toon-recipe übernimmt

Extrakt aus `/home/erics/software/toon-recipe` (nur gelesen, nie verändert), Stand 2026-08-09.
Alle Pfade in diesem Dokument sind **relativ zum Referenz-Repo**, sofern nicht anders gesagt.
Ziel: jemand, der toon-recipe nie gesehen hat, kann damit ein zweites Repo im selben Stil bauen.

Ops-Sprache in diesem Dokument ist Englisch, wo der Code Englisch ist (Zitate sind wörtlich).

---

## 1 — Monorepo-Gerüst

### 1.1 Datei-Liste der Wurzel

```
.bun-version              "1.3.14" (von setup-bun in CI gelesen)
.env.example              vollständig kommentierte Vorlage; .env selbst ist gitignored
.github/workflows/        ci.yml · deploy.yml · release.yml
.gitignore                node_modules/ dist/ data/ *.db *.db-* *.sqlite* .env .env.* !.env.example
                          .DS_Store *.log .vite/ dev-dist/ coverage/
CLAUDE.md                 ~775 Zeilen: locked decisions + Gotchas
README.md                 Setup, Stack-Tabelle, Smoke-Test
Dockerfile                multi-stage, single-origin (§8)
docker-compose.yml        app + caddy + mailpit
docker/                   Caddyfile · entrypoint.sh · env.example · toon-deploy.sh
docs/                     API.md · deployment.md · i18n.md · open-work.md · server-setup.md · vps-runbook.md
package.json              Root-Workspace (unten)
tsconfig.json             Basis-tsconfig, "files": []
scripts/                  dev.ts · typecheck.ts · i18n-check.ts
apps/api/  apps/web/  packages/shared/
bun.lock
```

Es gibt **keine** `bunfig.toml`.

### 1.2 Root `package.json` (wörtlich)

```json
{
  "name": "toon-recipe",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun run scripts/dev.ts",
    "dev:api": "bun --filter @toon/api dev",
    "dev:web": "bun --filter @toon/web dev",
    "build": "bun --filter @toon/web build",
    "start": "bun --filter @toon/api start",
    "test": "bun test",
    "typecheck": "bun run scripts/typecheck.ts",
    "i18n:check": "bun run scripts/i18n-check.ts",
    "db:generate": "bun --filter @toon/api db:generate",
    "db:migrate": "bun --filter @toon/api db:migrate",
    "db:studio": "bun --filter @toon/api db:studio",
    "seed": "bun --filter @toon/api seed",
    "auth:reset-password": "bun --filter @toon/api auth:reset-password --",
    "uploads:gc": "bun --filter @toon/api uploads:gc --"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "drizzle-kit": "^0.31.10",
    "typescript": "^7.0.2"
  }
}
```

`scripts/typecheck.ts` ist 20 Zeilen: es spawnt sequenziell
`bunx tsc -p tsconfig.json --noEmit` in `["packages/shared", "apps/api", "apps/web"]` und setzt
`process.exit(1)`, wenn eines fehlschlägt. `scripts/dev.ts` spawnt `bun run dev` in `apps/api` und
`apps/web` parallel mit `stdio: "inherit"` und killt beide bei SIGINT/SIGTERM — keine
concurrently-Dependency.

### 1.3 `apps/api/package.json`

```json
{
  "name": "@toon/api", "version": "0.1.0", "private": true, "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:generate": "bunx drizzle-kit generate",
    "db:migrate": "bun scripts/migrate.ts",
    "db:studio": "bunx drizzle-kit studio",
    "seed": "bun scripts/seed.ts",
    "auth:reset-password": "bun scripts/reset-password.ts",
    "uploads:gc": "bun scripts/uploads-gc.ts"
  },
  "dependencies": {
    "@hono/zod-validator": "^0.9.0",
    "@libsql/client": "^0.17.4",
    "@toon/shared": "workspace:*",
    "arctic": "^3.7.0",          // toon-finance: entfällt (kein OAuth)
    "drizzle-orm": "^0.45.2",
    "hono": "^4.12.34",
    "sharp": "^0.35.3",          // toon-finance: entfällt (keine Uploads)
    "unpdf": "^1.8.0",           // toon-finance: entfällt
    "zod": "^4.4.3"
  }
}
```

### 1.4 `apps/web/package.json`

```json
{
  "name": "@toon/web", "version": "0.1.0", "private": true, "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview",
               "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": {
    "@tanstack/react-query": "^5.101.4",
    "@tanstack/react-query-persist-client": "^5.101.4",
    "@tanstack/react-router": "^1.170.18",
    "@toon/shared": "workspace:*",
    "clsx": "^2.1.1",
    "lucide-react": "^1.28.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.0.5",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2",
    "vite": "^8.2.0",
    "vite-plugin-pwa": "^1.3.0"
  }
}
```

### 1.5 `packages/shared/package.json`

Kein Build-Step — die Quelle IST das Paket:

```json
{
  "name": "@toon/shared", "version": "0.1.0", "private": true, "type": "module",
  "main": "./src/index.ts", "module": "./src/index.ts", "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts", "./*": "./src/*" },
  "scripts": { "test": "bun test", "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": { "zod": "^4.4.3" }
}
```

### 1.6 Wie die tsconfigs aufeinander zeigen

Root `tsconfig.json` — Basis, `"files": []`, also selbst nichts kompilierend:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2023"],
    "module": "Preserve", "moduleResolution": "bundler", "moduleDetection": "force",
    "allowImportingTsExtensions": true, "verbatimModuleSyntax": true, "resolveJsonModule": true,
    "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true, "noUnusedLocals": false,
    "noEmit": true, "skipLibCheck": true, "esModuleInterop": true,
    "allowSyntheticDefaultImports": true, "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "paths": {
      "@toon/shared": ["./packages/shared/src/index.ts"],
      "@toon/shared/*": ["./packages/shared/src/*"]
    }
  },
  "files": []
}
```

**Kein `baseUrl`** — in TS 7 entfernt; `paths` lösen relativ zur jeweiligen tsconfig-Datei auf.
Deshalb wiederholt JEDES Workspace-tsconfig seine `paths` mit eigener Relativität:

| Datei | `types` | `paths` | `include` |
| --- | --- | --- | --- |
| `apps/api/tsconfig.json` | `["bun"]` | `../../packages/shared/src/…` | `src/**/*.ts`, `scripts/**/*.ts`, **`test/**/*.ts`**, `drizzle.config.ts` |
| `apps/web/tsconfig.json` | `["vite/client"]`, `jsx: "react-jsx"`, `lib +DOM` | `../../packages/shared/src/…` **und `"@/*": ["./src/*"]`** | `src/**/*.ts`, `src/**/*.tsx`, `vite.config.ts` |
| `packages/shared/tsconfig.json` | `["bun"]` | `./src/…` | `src/**/*.ts`, `test/**/*.ts` |

> **Gotcha:** `apps/api/tsconfig.json` inkludiert **`test/**`**, nicht `tests/**`. Ein Verzeichnis
> `apps/api/tests/` wäre für `bun run typecheck` unsichtbar.
> **Gotcha:** weil `apps/web` `types: ["vite/client"]` setzt, braucht ein `import … from "bun:test"`
> unter `src/**` einen Shim (`src/features/import/lib/bun-test.d.ts`).

### 1.7 Wie `.env` gefunden wird

Es gibt **genau eine** `.env`, im Repo-Root. Zwei unabhängige Mechanismen lesen sie:

1. **API** — `apps/api/src/env.ts` lädt sie selbst, weil Bun nur aus dem cwd auto-lädt und die API
   aus `apps/api` gestartet wird:

   ```ts
   export const REPO_ROOT = resolve(import.meta.dir, "../../..");

   function loadRootDotEnv(): void {
     if (process.env.NODE_ENV === "test") return;   // Tests dürfen nie eine dev-.env sehen
     for (const file of [".env", ".env.local"]) { … }  // vorhandene process.env gewinnt immer
   }
   loadRootDotEnv();
   ```
   Relative Pfade (`DATABASE_URL="file:./data/local.db"`, `UPLOAD_DIR`, `WEB_DIST_DIR`) werden
   gegen `REPO_ROOT` aufgelöst, nicht gegen `process.cwd()`.

2. **Web** — `apps/web/vite.config.ts`:
   ```ts
   envDir: "../../",
   envPrefix: ["VITE_", "PUBLIC_"],
   ```
   Ohne beides wird `import.meta.env.PUBLIC_API_URL` nicht inlined und die App redet mit dem
   falschen Port. `loadEnv(mode, here("../../"), ["VITE_","PUBLIC_","API_"])` liest zusätzlich
   `API_PORT` für das Dev-Proxy-Target.

---

## 2 — API-Aufbau

### 2.1 Bootstrap: `apps/api/src/index.ts`, Reihenfolge ist der Inhalt

```ts
export const app = new Hono<AppEnv>();

app.onError(onErrorHandler);          // 1. Fehler-Envelope
app.notFound(notFoundHandler);        // 2. 404 im selben Envelope

if (!env.isTest) app.use("*", logger());              // 3. hono/logger, nie unter bun test

app.use("/api/*", cors({                              // 4. CORS nur auf /api
  origin: (origin) => (env.webOrigins.includes(origin) ? origin : env.webOrigins[0] ?? ""),
  credentials: true,
  allowMethods: ["GET","POST","PATCH","PUT","DELETE","OPTIONS"],
  allowHeaders: ["Content-Type","Authorization"],
  exposeHeaders: ["Content-Disposition","Location"],
  maxAge: 86400,
}));

app.use("*", localeMiddleware);                       // 5. Accept-Language -> c.set("locale")

app.get("/api/health", (c) => c.json({                // 6. Probe + Capability-Auskunft
  status: "ok" as const,
  version: process.env.npm_package_version ?? "0.1.0",
  time: new Date().toISOString(),
  database: env.databaseKind,
  features: serverFeatures(),
}));

app.get("/uploads/:filename", …);                     // 7. signierte Uploads (entfällt hier)

app.route("/api/auth", authRoutes);                   // 8. Feature-Router
app.route("/api/groups", groupRoutes);
app.route("/api/groups/:groupId/imports", importRoutes);
app.route("/api/groups/:groupId/shopping-lists", shoppingRoutes);
app.route("/api/groups/:groupId", recipeRoutes);      // LETZTER: besitzt den Catch-all

if (env.webDistDir !== null) app.use("*", webAppMiddleware(env.webDistDir));  // 9. GANZ zuletzt

if (!env.isTest) { …SIGTERM/SIGINT-Shutdown… }
if (!env.isTest) { await dbReady; console.log("[api] …"); }

export default { port: env.API_PORT, fetch: app.fetch, maxRequestBodySize: 20 * 1024 * 1024 };
```

Zwei Reihenfolge-Regeln, die man sonst schmerzhaft lernt:
- **Spezifischere Mounts vor dem Catch-all** (`…/imports` und `…/shopping-lists` vor
  `/api/groups/:groupId`).
- **`localeMiddleware` vor jedem Router**, damit `onErrorHandler`/`notFoundHandler` die Locale lesen
  können — deren `requestLocale(c)` hat trotzdem ein `?? env.defaultLocale`, weil `app.onError` auch
  feuern kann, bevor eine `app.use("*")`-Middleware lief.
- **`staticWeb` ist der LETZTE Mount**, weil er einen SPA-Fallback hat; alles, was er zuerst sieht,
  erreicht keine echte Route mehr.

Der Server-Export ist ein Bun-Serve-Objekt (kein `Bun.serve()`-Aufruf), damit `bun test` dieselbe
`app` per `app.request(path)` benutzen kann, ohne einen Port zu binden.

### 2.2 env-Validierung: `apps/api/src/env.ts`

Ein einziges `EnvSchema` (zod), einmal beim Modul-Load geparst, `process.exit(1)` mit lesbarer
Liste bei Fehler — kein Stacktrace:

```ts
function loadEnv(): Env {
  const result = EnvSchema.safeParse(rawEnv());
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    console.error(["Invalid environment variables — check your .env (template: .env.example):",
                   ...lines].join("\n"));
    process.exit(1);
  }
  return result.data;
}
export const env: Env = loadEnv();
```

Drei Muster, die man übernimmt:

- **`rawEnv()` behandelt leere Strings als „nicht gesetzt"** (`if (value.trim().length === 0) continue`),
  damit `DATABASE_AUTH_TOKEN=` in der `.env` nicht ein `min(1)` reißt.
- **Test-Defaults im selben Schritt:**
  ```ts
  if (source.NODE_ENV === "test") {
    source.DATABASE_URL = source.TEST_DATABASE_URL ?? "file::memory:";
    source.SESSION_SECRET ??= "test-secret-test-secret-test-secret";
  }
  ```
  Eine Entwickler-`.env` kann `bun test` also nie auf die echte DB zeigen.
- **`.transform()` fügt abgeleitete Felder hinzu**, `.refine()` erzwingt Kombinationsregeln.
  Abgeleitet u. a.: `isProduction`, `isTest`, `webOrigins` (gesplittet + getrimmt),
  `databaseKind: "remote" | "file"`, `databaseUrl` (Root-relativ aufgelöst), `trustProxy`,
  `mailTransport` (unter Test immer `"console"`), `webDistDir: string | null`, `defaultLocale`.
  Refines lauten z. B.:
  ```
  "DATABASE_AUTH_TOKEN is required for a remote libsql:// database"
  "MAIL_FROM is required for a real MAIL_TRANSPORT (a verified sender domain)"
  "MAIL_USER/MAIL_PASSWORD must not be combined with MAIL_SECURITY=none — the credentials
   would cross the network in cleartext (use MAIL_SECURITY=starttls or =tls)"
  ```
  Alles auf Englisch: env-Validierung ist Ops-Ausgabe und wird nie durch `t()` geschickt.

### 2.3 Fehler-Envelope + ERROR_CODES

`packages/shared/src/schemas/common.ts`:

```ts
export const ERROR_CODES = [
  "bad_request","validation_failed","unauthorized","invalid_credentials","forbidden","not_found",
  "conflict","email_taken", … ,"rate_limited", … ,"internal_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
```

`code` ist **Wire-Contract und wird nie umbenannt** (`code` ist auf der Leitung `z.string()`, damit
ein alter Client einen neuen Code nicht ablehnt).

`apps/api/src/lib/errors.ts` — der einzige Fehlerpfad:

```ts
export type ErrorText = ServerKey | { key: ServerKey; values: MessageValues };

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details?: unknown;
  readonly text: ErrorText;

  constructor(status: number, code: ErrorCode | string, text: ErrorText, details?: unknown) {
    super(serverText("en", text));   // Error.message bleibt ENGLISCH -> Log ist einsprachig
    …
  }

  toBody(locale: Locale = DEFAULT_LOCALE): ApiErrorBody { … }

  static badRequest(text: ErrorText = "server.error.badRequest", details?: unknown): ApiError
  static unauthorized(text: ErrorText = "server.error.unauthorized"): ApiError
  static invalidCredentials(text: ErrorText = "server.error.invalidCredentials"): ApiError
  static forbidden(text: ErrorText = "server.error.forbidden"): ApiError
  static notFound(text: ErrorText = "server.error.notFound"): ApiError
  static conflict(code: ErrorCode | string = "conflict", text: ErrorText = "server.error.conflict"): ApiError
  static payloadTooLarge(…) · unsupportedMediaType(…) · validationFailed(details, text) · internal(…)
}
```

`text` ist ein **Katalog-Key**, nie ein Satz — `tsc` lehnt ein String-Literal ab, das kein
`ServerKey` ist. Das ist die Sperre, die deutsche Literale aus Handlern hält.

```ts
export const onErrorHandler: ErrorHandler = (error, c) => {
  const locale = requestLocale(c);
  const apiError = toApiError(error, locale);      // ApiError | ZodError | HTTPException | sonst 500
  if (apiError.status >= 500) console.error(`[api] ${c.req.method} ${c.req.path} ->`, error);
  else if (env.NODE_ENV === "development") console.warn(…);
  return c.json(apiError.toBody(locale), apiError.status as 400);
};

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(ApiError.notFound({ key: "server.error.routeUnknown",
                             values: { method: c.req.method, path: c.req.path } }).toBody(requestLocale(c)), 404);
```

Ein `ZodError` wird zu `ApiError.validationFailed(toValidationIssues(error, locale))` (422).
`HTTPException`s eigene Message wird **verworfen** und durch `"server.error.requestFailed"` ersetzt.

Für `zValidator` gibt es einen gemeinsamen Hook (`services/groups/validation.ts`):

```ts
export function onValidationError(result: { success: boolean; error?: unknown }): void {
  if (result.success) return;
  throw ApiError.validationFailed(toIssues(result.error));
}
// Aufruf: zValidator("json", CreateShoppingListRequestSchema, onValidationError)
```

Antwort-Helfer in `lib/http.ts`:

```ts
export function json<T>(c: Context, data: T): Response                       // 200
export function created<T>(c: Context, data: T, location?: string): Response // 201 + Location
export function noContent(c: Context): Response                              // 204
export function toIso(value: number | Date): string
export function toIsoOrNull(value: number | null | undefined): string | null
export function parseCsvParam(value: string | undefined): string[]
```

### 2.4 Kontext-Typen und Guards: `lib/types.ts`

```ts
export interface Membership { groupId: string; userId: string; role: GroupRole }

export interface AppVariables {
  user?: User;          // gesetzt von requireSession / optionalSession
  sessionId?: string;
  membership?: Membership;  // gesetzt von requireGroupRole
  locale?: Locale;      // OPTIONAL mit Absicht — onError kann vor der Middleware feuern
}
export type AppEnv = { Variables: AppVariables };
export type AppContext = Context<AppEnv>;

export function requireUser(c: AppContext): User            // wirft 401
export function requireMembership(c: AppContext): Membership // wirft 403 "server.group.noAccess"
```

Jeder Sub-Router ist `new Hono<AppEnv>()`, damit `c.get("user")` typisiert ist.

### 2.5 Session-Middleware: `middleware/session.ts` (Signaturen wörtlich)

```ts
export async function loadSession(c: AppContext): Promise<boolean>

export function requireSession(): MiddlewareHandler<AppEnv>;
export function requireSession(c: AppContext, next: Next): Promise<void | Response>;

export function optionalSession(): MiddlewareHandler<AppEnv>;
export function optionalSession(c: AppContext, next: Next): Promise<void | Response>;
```

Die Doppel-Signatur (Factory **oder** direkter Handler) ist Absicht — alle drei Formen sind gültig:
```ts
router.use("*", requireSession());
router.use("*", requireSession);
router.get("/x", requireSession(), handler);
```

`loadSession` liest das Cookie, ruft `resolveSession(db, sessionId)`, löscht ein **abgelaufenes /
unbekanntes Cookie sofort** (`clearSessionCookie(c)`), erneuert das Cookie bei sliding expiry
(`if (resolved.renewed) setSessionCookie(c, sessionId, resolved.session.expiresAt)`) und setzt
`c.set("user", toUserDto(resolved.user))` + `c.set("sessionId", sessionId)`.

### 2.6 Rollen-Middleware: `middleware/group.ts`

Semantik (aus dem Datei-Header, wörtlich):

```
no session             -> 401 unauthorized
unknown group/resource -> 404 not_found   (never leaks that it exists)
not a member           -> 403 forbidden
role too low           -> 403 forbidden
ok                     -> c.set("membership", { groupId, userId, role })
```

Signaturen:

```ts
const RESOURCE_PARAMS = ["recipeId","collectionId","tagId","draftId","inviteId"] as const;
export type ResourceParam = (typeof RESOURCE_PARAMS)[number];
export interface GroupRoleOptions { via?: ResourceParam }

export async function resolveGroupId(c: AppContext, options?: GroupRoleOptions): Promise<string>
export async function resolveMembership(groupId: string, userId: string):
  Promise<{ exists: boolean; membership?: Membership }>
export function requireGroupRole(required: GroupRole = "member",
                                 options: GroupRoleOptions = {}): MiddlewareHandler<AppEnv>
export const requireGroupMember = (): MiddlewareHandler<AppEnv> => requireGroupRole("member");
export const requireGroupAdmin  = (): MiddlewareHandler<AppEnv> => requireGroupRole("admin");
export const requireGroupOwner  = (): MiddlewareHandler<AppEnv> => requireGroupRole("owner");
```

`resolveMembership` unterscheidet „Gruppe existiert nicht" von „kein Mitglied" **in einer Query**
per LEFT JOIN:

```ts
.select({ id: groups.id, role: groupMembers.role })
.from(groups)
.leftJoin(groupMembers, and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, userId)))
.where(eq(groups.id, groupId)).limit(1);
// kein row  -> { exists: false }
// role null -> { exists: true }            (kein Mitglied)
```

Router wenden es **einmal** an, nie ein Handler inline:
```ts
shoppingRoutes.use("*", requireSession());
shoppingRoutes.use("*", requireGroupRole("member"));
```

**Für toon-finance:** die Rollen-Achse fällt weg, die *Form* bleibt. Der Ersatz ist eine
`requireHousehold()`-Middleware, die `c.set("household", { householdId, userId })` setzt und
404/403 nach genau demselben Muster unterscheidet. Zwei Personen bedeuten nicht „kein
Middleware-Check" — sie bedeuten „ein Check, keine Rollen".

### 2.7 Cookies: `lib/cookies.ts`

```ts
export const SESSION_COOKIE = "toon_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;             // 30 Tage
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // sliding ab < 15 Tagen Rest

function baseOptions() {
  return { path: "/", httpOnly: true, sameSite: "Lax", secure: env.isProduction } as const;
}
export function setSessionCookie(c: Context, sessionId: string, expiresAt: number): void
export function readSessionCookie(c: Context): string | undefined
export function clearSessionCookie(c: Context): void
```

`maxAge` wird aus `expiresAt` gerechnet, damit Cookie und DB-Zeile gemeinsam ablaufen.

### 2.8 Sessions-Service: `services/auth/sessions.ts`

Undurchsichtige DB-Sessions, der Cookie-Wert **ist** der Primary Key:

```ts
export function generateSessionId(): string        // 32 zufällige Bytes -> base64url (43 Zeichen)
export function sessionHandle(sessionId: string): string   // sha256(SESSION_SECRET + ":" + id).slice(0,32)
export async function createSession(database, userId, fingerprint?): Promise<SessionRow>
export async function resolveSession(database, sessionId): Promise<ResolvedSession | null>
export async function deleteSession(database, sessionId): Promise<boolean>
export async function deleteOtherSessions(database, userId, keepSessionId?): Promise<void>
export async function sweepExpiredSessions(database): Promise<void>
export async function listSessionsForUser(database, userId, currentSessionId): Promise<SessionInfo[]>
export async function findSessionByHandle(database, userId, handle): Promise<SessionRow | null>
```

Drei Details, die man übernimmt:

- **`lastUsedAt` wird nur alle 60 s geschrieben** (`LAST_USED_WRITE_INTERVAL_MS`), sonst wäre jeder
  Request ein Write.
- **`sweepExpiredSessions` läuft opportunistisch**, maximal alle 5 Minuten pro Prozess, und wirft nie.
- **`GET /api/auth/sessions` gibt nur `sessionHandle(id)` heraus, nie die id.** Grund wörtlich aus
  dem Code: *„hono's `logger()` writes `c.req.path`, so a live 30-day session token ended up in the
  API log and in every reverse-proxy access log, where it could be replayed as a cookie."*

### 2.9 Passwörter: `services/auth/passwords.ts`

```ts
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$…";   // echter Hash eines Zufallsstrings

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const target = hash && hash.length > 0 ? hash : DUMMY_PASSWORD_HASH;
  try {
    const matches = await Bun.password.verify(password, target, "argon2id");
    return matches && target !== DUMMY_PASSWORD_HASH;
  } catch { return false; }   // kaputter Hash in der DB darf nie 500 werden
}
```

Der Dummy-Hash hält die Antwortzeit für unbekannte E-Mails konstant. Login zieht daraus die Reihenfolge:

```ts
const user = await findUserByEmail(db, body.email);
const matches = await verifyPassword(body.password, user?.passwordHash ?? null); // IMMER
if (!user) throw ApiError.invalidCredentials();
```

### 2.10 Rate-Limit: `services/auth/rateLimit.ts`

In-Memory Sliding Window, `Map<string, number[]>`, `MAX_BUCKETS = 10_000`, single-process.
Regeln als benannte Konstanten, z. B.:

```ts
export const LOGIN_RULE: RateLimitRule = { limit: 10, windowMs: 60_000 };
export const LOGIN_EMAIL_RULE: RateLimitRule = { limit: 20, windowMs: 15 * 60_000 };
export const REGISTER_RULE: RateLimitRule = { limit: 5, windowMs: 15 * 60_000 };
export const FORGOT_PASSWORD_RULE: RateLimitRule = { limit: 5, windowMs: 15 * 60_000 };
export const FORGOT_PASSWORD_EMAIL_RULE: RateLimitRule = { limit: 3, windowMs: 15 * 60_000 };
export const PASSWORD_RESET_RULE: RateLimitRule = { limit: 10, windowMs: 15 * 60_000 };
```

```ts
export function clientIp(c: Context): string      // X-Forwarded-For NUR bei env.trustProxy
export function enforceRateLimit(c: Context, scope: string, identifier: string,
                                 rule: RateLimitRule): string   // wirft 429 "rate_limited"
export function resetRateLimits(key?: string): void
```

`enforceRateLimit` ist **unter `NODE_ENV=test` deaktiviert** (`if (env.isTest) return key;`), damit
Integrationstests deterministisch bleiben. Zwei Eimer pro Login: `${ip}|${email}` **und** nur
`email` — der zweite kann von keinem Header zurückgesetzt werden.

### 2.11 Feature-Router-Muster (aus `routes/shopping.ts`)

```ts
export const shoppingRoutes = new Hono<AppEnv>();
shoppingRoutes.use("*", requireSession());
shoppingRoutes.use("*", requireGroupRole("member"));

shoppingRoutes.get("/", async (c) => {
  const membership = requireMembership(c);
  return json(c, { items: await listShoppingLists(db, membership.groupId) });
});

shoppingRoutes.post("/",
  zValidator("json", CreateShoppingListRequestSchema, onValidationError),
  async (c) => {
    const membership = requireMembership(c);
    const user = requireUser(c);
    const list = await createShoppingList(db, membership.groupId, user.id, c.req.valid("json"));
    return created(c, { list }, `/api/groups/${membership.groupId}/shopping-lists/${list.id}`);
  });
```

Handler sind dünn: validieren, Kontext lesen, Service rufen, Envelope zurück. Die gesamte
Fachlogik liegt in `services/<domain>/*.service.ts` und nimmt als ersten Parameter ein `DbLike`
(siehe §3.5), damit sie in eine Transaktion oder eine Test-DB gehängt werden kann.

Nur `routes/auth.ts` liest JSON per Hand, mit einem lokalen Helfer:
```ts
async function readJson<S extends z.ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw ApiError.badRequest("server.auth.invalidJsonBody"); }
  return schema.parse(raw) as z.output<S>;   // ZodError -> 422 via onErrorHandler
}
```

### 2.12 Einladungen (das für toon-finance relevante Auth-Feature)

`services/auth/invites.ts`:

```ts
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export function generateInviteToken(): string   // 32 Bytes -> base64url
export async function findInviteByToken(database, token): Promise<GroupInviteRow | undefined>
export async function loadRedeemableInvite(database, token): Promise<GroupInviteRow>
export async function acceptInvite(database, token, userId): Promise<AcceptedInvite>
```

Regeln, die man 1:1 übernimmt:
- **Der Token ist die Capability.** Die eingeladene E-Mail ist informativ und wird bewusst NICHT
  erzwungen — sonst kann man einen Link nicht weiterleiten.
- 404 `invite_invalid` für unbekannt/revoked/schon eingelöst, 409 `invite_expired` nach Ablauf
  (die Zeile wird dabei auf `status: "expired"` gesetzt).
- `acceptInvite` ist **idempotent**: ein bereits Beigetretener bekommt `alreadyMember: true` und
  wird nie herabgestuft.
- Bei `POST /register` mit `inviteToken` wird der Token **vor** dem User-Insert validiert
  (`await loadRedeemableInvite(...)`), damit ein kaputter Token keinen User ohne Gruppe hinterlässt.

`group_invites.token` speichert den **Rohwert**, `password_reset_tokens.token_hash` einen SHA-256.
Die Begründung steht im Schema-Kommentar: *„a leaked invites table costs you group membership, a
leaked reset table would cost every account."*

---

## 3 — DB-Schicht

### 3.1 Schema-Stil (`apps/api/src/db/schema.ts`)

Konventionen aus dem Datei-Header, wörtlich:

```
- ids: crypto.randomUUID() text primary keys
- timestamps: integer unix MILLISECONDS (exposed as ISO strings by the API)
- booleans: integer 0/1 via mode: "boolean"
- every FK used for listing has an index; group-scoped tables cascade from `groups`
```

Muster einer Tabelle:

```ts
const now = () => Date.now();

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),                  // = der Cookie-Wert
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    lastUsedAt: integer("last_used_at").notNull().$defaultFn(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);
```

- Spalten in **snake_case** in der DB, **camelCase** in TS.
- Der zweite Parameter ist eine **Array-returnende Funktion** mit `index(…)`, `uniqueIndex(…)`,
  `primaryKey({ columns: [...] })`.
- JSON-Spalten typisiert: `text("parsed", { mode: "json" }).$type<ParsedRecipe>().notNull()`.
- `real(…)` für Mengen. **Für toon-finance gilt das ausdrücklich nicht: Geld ist
  `integer("amount_cents").notNull()`** — `real` wäre ein Float und damit ein Bug.
- Am Dateiende werden alle Row-Typen exportiert:
  ```ts
  export type SessionRow = typeof sessions.$inferSelect;
  export type NewSessionRow = typeof sessions.$inferInsert;
  ```
- `relations(...)` für die Drizzle-Query-API, gebündelt am Ende.

**Zwei übertragbare Schema-Entscheidungen:**

1. **Berechnete/abgeleitete Spalten schreibt die App, nicht die DB, und sie sind `.notNull()` OHNE
   Drizzle-Default.** Das macht sie in `$inferInsert` verpflichtend, also scheitert `tsc` an einer
   Insert-Stelle, die sie vergisst, statt still NULL zu speichern. Die Migration muss dann
   SQL-seitig ein `DEFAULT ''` mitbringen (SQLite kann einer gefüllten Tabelle keine NOT-NULL-Spalte
   ohne Default hinzufügen) — eine bewusste Schema/DB-Divergenz, und `db:generate` bietet an, sie zu
   „reparieren". *Nicht* annehmen.
2. **Ein UNIQUE-Index als Fachregel.** `shopping_list_items(list_id, merge_key)` ist das, was aus
   `200 g + 200 g Mehl` eine `400 g`-Zeile macht — durchgesetzt von der DB statt von einem
   read-modify-write, den zwei Mitglieder verschränken könnten.

Für toon-finance ist das direkte Gegenstück: `mutations`/`transactions` haben eine
`(household_id, occurred_at)`- und `(household_id, kind)`-Index-Achse, und ein UNIQUE-Index auf
`(household_id, external_key)` schützt den einmaligen xlsx-Import gegen doppelte Ausführung.

### 3.2 Verbindungs-PRAGMAs: `apps/api/src/db/client.ts`

```ts
const LOCAL_FILE_PRAGMAS: readonly string[] = [
  "journal_mode = WAL",
  "synchronous = NORMAL",
  "busy_timeout = 5000",     // Default ist 0 -> SQLITE_BUSY sofort
  "cache_size = -65536",     // negativ = KiB, also 64 MB Page-Cache
  "mmap_size = 268435456",   // 256 MB
];

function isLocalFile(url: string): boolean {
  return url.startsWith("file:") && !url.includes(":memory:");
}

export function createDatabase(options: CreateDatabaseOptions = {}): CreatedDatabase {
  const url = prepareUrl(options.url ?? env.databaseUrl);
  const authToken = options.authToken ?? env.DATABASE_AUTH_TOKEN;
  const client = createClient(authToken ? { url, authToken } : { url });
  const db = drizzle(client, { schema, logger: env.DEBUG_SQL === true });
  return { client, db, ready: applyPragmas(client, url) };
}

const shared = createDatabase();
export const client: Client = shared.client;
export const db: Database = shared.db;
export const dbReady: Promise<void> = shared.ready;
```

**Warum das load-bearing ist (gemessene Zahlen aus dem Datei-Kommentar):** libSQL-Defaults sind
`journal_mode=delete` + `synchronous=FULL`, also ein voller fsync pro Statement — **15,5 ms für
einen Einzeil-INSERT** (ext4/NVMe), 5,2 ms mit WAL allein, **0,04 ms** mit WAL + `synchronous=NORMAL`.
`journal_mode` ist **persistent in der Datei**, `synchronous` ist **pro Connection** — deshalb steht
es in `createDatabase()` und nicht in einer Migration. Ein abgelehntes PRAGMA warnt nur und legt den
Server nicht lahm; für `:memory:` und für remote `libsql://` wird gar nichts gesendet.

> **Die eine Entscheidung, die toon-finance NEU treffen muss.** toon-recipe schreibt dazu wörtlich:
> *„`synchronous=NORMAL` under WAL can lose the last transactions to a power cut, never to a process
> crash — the right trade for a recipe box, not for a ledger."* toon-finance **ist** ein Kassenbuch.
> Empfehlung: `journal_mode = WAL` behalten (Leser blockieren Schreiber nicht, `busy_timeout` bleibt
> sinnvoll), aber `synchronous = FULL` setzen und die Begründung als Kommentar an dieselbe Stelle
> schreiben. Der Preis ist real (ca. 5 ms statt 0,04 ms pro Write), aber eine Haushaltskasse macht
> ein paar Dutzend Writes am Tag, keine paar Tausend pro Sekunde. Wer WAL+NORMAL trotzdem will,
> muss dokumentieren, dass ein Stromausfall die letzten Buchungen verlieren darf.

Zweiter Messwert, der die Architektur begrenzt: **eine lokale libSQL-Datei ist EINE serialisierte
Spur.** 8 parallele Kopien derselben Query brauchen 8× so lang, egal ob ein Client oder acht
(292 ms vs. 288 ms). Der Event-Loop blockiert nicht (`/api/health` bleibt bei 0,06 ms). Der Hebel
ist also **billigere Queries, nie mehr Nebenläufigkeit** — kein Read-Pool.

### 3.3 Migrations-Workflow

```
bun run db:generate   -> bunx drizzle-kit generate  (schreibt apps/api/drizzle/NNNN_*.sql + meta/)
bun run db:migrate    -> bun apps/api/scripts/migrate.ts
bun run db:studio     -> bunx drizzle-kit studio
```

`apps/api/drizzle.config.ts`:

```ts
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: authToken ? { url, authToken } : { url },
  strict: true, verbose: true,
});
```

`src/db/migrate.ts` — von `db:migrate` **und** von jedem Integrationstest benutzt:

```ts
export const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");  // cwd-unabhängig

export async function runMigrations(database: Database = sharedDb): Promise<void> {
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
  await backfillFoldedColumns(database);
}
```

Backfills laufen **in JS, nicht in SQL**, sind idempotent und **bewusst ohne Transaktion** (libSQL
0.17.4 verwirft eine `file::memory:`-DB beim Commit — siehe §3.5). Sie sind so formuliert, dass sie
auf einer aktuellen DB nichts matchen.

Generierte SQL-Dateien tragen einen Kopfkommentar, der das *Warum* erklärt, und
`--> statement-breakpoint` zwischen den Statements (von drizzle-kit).

### 3.4 Migrationen laufen beim Boot

`docker/entrypoint.sh` führt vor dem Start aus:

```sh
if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
  log "SKIP_MIGRATIONS=1 — Migrationen werden übersprungen"
else
  log "applying database migrations"
  bun apps/api/scripts/migrate.ts
fi
exec "$@"
```

`set -eu` ganz oben: **eine fehlgeschlagene Migration muss den Container stoppen**, sonst antwortet
die API auf einer halb migrierten DB mit verwirrenden 500ern und der Healthcheck meldet „gesund".

### 3.5 Transaktionen: `services/groups/support.ts`

```ts
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbLike = Database | Tx;

export const transactionsSupported: boolean = !env.databaseUrl.includes(":memory:");

export async function withTransaction<T>(db: Database, work: (tx: DbLike) => Promise<T>): Promise<T> {
  if (!transactionsSupported) return work(db);
  return db.transaction(async (tx) => work(tx));
}
export function nowMs(): number { return Date.now(); }
```

Grund (verifiziert mit `@libsql/client` 0.17.4 + Bun 1.3.14): `client.transaction()` öffnet eine
ZWEITE Connection, und bei `file::memory:` ist das eine brandneue, leere DB — nach dem Commit sind
alle Tabellen weg. Datei-DBs und Turso sind nicht betroffen. Da Tests auf `file::memory:` laufen,
degradiert `withTransaction` dort auf sequentielle Statements: die Schreibreihenfolge wird noch
getestet, nur die Rollback-Garantie fehlt.

**Für toon-finance ist das die wichtigste offene Frage der DB-Schicht.** Ein Ledger, dessen
Integrationstests keine echte Transaktion sehen, testet die entscheidende Eigenschaft nicht.
Empfehlung: `TEST_DATABASE_URL` auf eine **temporäre Datei** setzen für alle Tests, die eine
Transaktion anfassen (das ist genau die Gotcha-Empfehlung aus CLAUDE.md: *„Use a temp file DB in any
test that touches a transaction"*), und `transactionsSupported` unverändert übernehmen.

---

## 4 — Web-Aufbau

### 4.1 Die Datenfluss-Kette

```
lib/api.ts            der EINZIGE Ort mit fetch()
   -> lib/queries.ts       queryKeys + queryOptions + invalidate.*
      -> features/<x>/lib/queries.ts   Feature-Hooks (useQuery/useMutation)
         -> features/<x>/*Page.tsx     Screens
```

**Schicht 1 — `lib/api.ts`.** Ein privates `request<T>()`, darüber eine flache Funktion pro
Endpoint, darunter eine `api`-Fassade nur fürs Autocomplete.

```ts
export const API_BASE_URL: string =
  (buildEnv.PUBLIC_API_URL ?? buildEnv.VITE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

async function request<T>(path: string, input: RequestInput = {}): Promise<T> {
  const headers: Record<string,string> = { Accept: "application/json", "Accept-Language": getLocale() };
  …
  response = await fetch(apiUrl(path), { method, credentials: "include", headers, body: payload, signal });
  // catch -> ApiError { code: "network_error", status: 0 }
  if (response.status === 401 && !allowUnauthorized) handleUnauthorized();
  if (response.status === 204 || response.status === 205) return undefined as T;
  …
  if (!response.ok) throw toApiError(response.status, parsed, raw);
  return parsed as T;
}
```

- **`credentials: "include"` überall.**
- **`Accept-Language: getLocale()`** — CORS-safelisted, kein Preflight; damit rendert der Server
  `error.message` in der Sprache des Clients.
- Client-`ApiError` mit `code`, `status`, `details` und Gettern `isClientError`, `isUnauthorized`,
  `isForbidden`, `isNotFound`, `isOffline`.
- `setUnauthorizedHandler(handler)` wird vom `SessionProvider` registriert, damit ein 401 eine
  Client-Navigation statt eines Full-Reloads auslöst; `handleUnauthorized()` hat eine
  Loop-Bremse (`max. 1 Redirect/Sekunde`) und ignoriert `/login`, `/register`, `/invite/*`.
- `queryString(params)` lässt `null`/`undefined`/`""` weg.

**Schicht 2 — `lib/queries.ts`.**

```ts
export const STALE_TIME = { session: 60_000, list: 30_000, detail: 60_000, meta: 5 * 60_000 } as const;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.isClientError) return false;   // 4xx nie wiederholen
  return failureCount < 2;
}
export const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, 8000);

const ROOT = "toon" as const;
export const queryKeys = {
  all: [ROOT] as const,
  me: () => [ROOT, "me"] as const,
  group: (groupId: string) => [ROOT, "group", groupId] as const,          // Prefix für ALLES der Gruppe
  recipes: (groupId, query?) => [ROOT,"group",groupId,"recipes", filterKey(query)] as const,
  shoppingList: (groupId, listId) => [ROOT,"group",groupId,"shopping-list", listId] as const,
} as const;
```

`filterKey()` sortiert Filter-Objekte und wirft leere Werte raus, damit der Key
reihenfolgeunabhängig stabil ist. Dann pro Read-Endpoint ein `queryOptions`:

```ts
export const shoppingListQuery = (groupId: string, listId: string) =>
  queryOptions({
    queryKey: queryKeys.shoppingList(groupId, listId),
    queryFn: ({ signal }) => fetchShoppingList(groupId, listId, { signal }),
    staleTime: 0,                      // eine geteilte Liste ändert jemand anderes gerade
    networkMode: "offlineFirst",       // Kaltstart offline rendert die persistierte Kopie
  });
```

Und ein `invalidate`-Objekt, das die Hierarchie der Keys ausnutzt:

```ts
export const invalidate = {
  everything: (qc) => qc.invalidateQueries({ queryKey: queryKeys.all }),
  me: (qc) => qc.invalidateQueries({ queryKey: queryKeys.me() }),
  group: (qc, groupId) => qc.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
  …
} as const;
```

`meQuery()` ist der Sonderfall: ein 401 ist **kein Fehler**, sondern `null`.

```ts
queryFn: async ({ signal }) => {
  try { return await fetchMe({ signal }); }
  catch (error) { if (isApiError(error) && error.isUnauthorized) return null; throw error; }
},
```

**Schicht 3 — Feature-Hooks** (`features/shopping/lib/queries.ts`) wrappen `useQuery`/`useMutation`
und liefern benannte Aktionen zurück:

```ts
export function useShoppingList(groupId: string | null, listId: string | null) {
  const options = shoppingListQuery(groupId ?? "", listId ?? "");
  return useQuery({ ...options, enabled: groupId !== null && listId !== null });
}

export function useCheckShoppingItem(groupId: string, listId: string) {
  const mutation = useMutation<Detail, Error, ItemVariables>({ mutationKey: SHOPPING_MUTATION_KEYS.check });
  return { ...mutation, check: (itemId: string) =>
    mutation.mutate({ groupId, listId, itemId, mutationId: newMutationId() }) };
}
```

Man beachte: die offline-fähige Mutation hat **nur einen `mutationKey`, keine `mutationFn`** — die
liegt in `setMutationDefaults` (§5).

**Schicht 4 — Screens** rufen nur Hooks. `ShoppingListDetailPage.tsx` ist der Default-Export der
Datei, weil `lazyPage` den Default zuerst probiert.

### 4.2 `query-client.ts`

```ts
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: {
    queries: { staleTime: STALE_TIME.list, gcTime: 10 * 60_000, retry: shouldRetry, retryDelay,
               refetchOnWindowFocus: false, refetchOnReconnect: true, refetchOnMount: true },
    mutations: { retry: false },
  }});
}
export const queryClient: QueryClient = createQueryClient();   // Modul-Scope, HMR behält den Cache
```

Der Singleton liegt hier und nicht in `app.tsx`, weil die Offline-Queue ihre Mutation-Defaults auf
**derselben Instanz** registrieren muss, bevor der Persister paused mutations wiederherstellt —
also bevor irgendeine Komponente rendert.

### 4.3 `app.tsx` — die Provider-Kette

```tsx
import "@/features/shopping/lib/offline";   // NUR wegen des Seiteneffekts

const persister = createIndexedDbPersister();   // EIN stabiler Persister für die App-Lebenszeit

export function App() {
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE_MS,
          buster: PERSIST_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersistQuery,
            shouldDehydrateMutation: shouldPersistMutation,
          },
        }}
        onSuccess={() => { void queryClient.resumePausedMutations().catch(() => undefined); }}
      >
        <I18nProvider><ToastProvider><RouterProvider router={router} /></ToastProvider></I18nProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
```

`PersistQueryClientProvider` statt `persistQueryClient()` in einem Effect, **weil er die ersten
Fetches zurückhält, bis der Restore fertig ist** — sonst würde ein Offline-Start `/api/auth/me`
feuern, scheitern und einen Tick lang „Server nicht erreichbar" malen.

`main.tsx` läuft vor dem ersten Render:

```tsx
applyTheme(readThemePreference());
initLocale(resolveDeviceLocale());     // Store + <html lang>, ohne Storage-Write, ohne PATCH
registerServiceWorker();               // no-op außer in production
createRoot(container).render(<StrictMode><App /></StrictMode>);
```

### 4.4 Router: `router.tsx` (code-based)

Kein File-based Routing, kein Codegen. Aufbau:

```tsx
const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFoundPage });

function RootLayout() {   // SessionProvider INNERHALB des Routers, damit ein 401 navigieren kann
  return <SessionProvider><Outlet /></SessionProvider>;
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/login",
  validateSearch: (search: Record<string, unknown>) => pick(search, ["next","error","reset"]),
  component: LoginPage,        // öffentliche Screens STATISCH importiert
});

function AppLayout() { return <RequireAuth><AppShell><Outlet /></AppShell></RequireAuth>; }
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppLayout });
// ^ pathless Layout-Route: alles darunter braucht eine Session

const shoppingListRoute = createRoute({
  getParentRoute: () => appRoute, path: "/shopping/$listId",
  component: groupScoped(lazyPage({
    candidates: ["/src/features/shopping/ShoppingListDetailPage.tsx"],
    exportNames: ["ShoppingListDetailPage"],
    title: "ui.routePlaceholder.shoppingList.title",
  })),
});

const routeTree = rootRoute.addChildren([ loginRoute, …, appRoute.addChildren([ … ]) ]);

export const router = createRouter({
  routeTree, defaultPreload: "intent", defaultPreloadDelay: 80,
  defaultNotFoundComponent: NotFoundPage, scrollRestoration: true,
});

declare module "@tanstack/react-router" { interface Register { router: typeof router } }
```

Zwei Helfer, die man mitnimmt:

```ts
function pick<Keys extends string>(search: Record<string, unknown>, keys: readonly Keys[])
  : Partial<Record<Keys, string>>   // NUR optionale Keys, damit <Link to="/"> kein search braucht

function groupScoped(Component: () => ReactElement): () => ReactElement   // wrappt in <RequireActiveGroup>
```

Filter-Parameter der Listenseite stehen als **eine Konstante** im Router
(`const RECIPE_FILTER_PARAMS = ["q","tags","collectionId","maxMinutes","difficulty","sort"] as const`),
weil `pick()` alles Ungelistete verwirft. Eine Redirect-Route muss **dieselben** Params deklarieren,
denn `validateSearch` läuft vor `beforeLoad`.

### 4.5 `lib/lazy-page.tsx`

Code-Splitting ohne harte Imports, damit das Web-Paket auch dann typecheckt, wenn ein Screen noch
nicht existiert:

```tsx
const pageModules = import.meta.glob<PageModule>([
  "/src/features/**/*.tsx",
  "!/src/features/auth/LoginPage.tsx",   // statisch importierte Screens ausschließen,
  …                                       // sonst kann rollup nicht splitten (INEFFECTIVE_DYNAMIC_IMPORT)
]);

export interface PageSpec {
  candidates: readonly string[];
  exportNames?: readonly string[];
  title: MessageKey;             // Katalog-KEY, kein String
  description?: MessageKey;
}
export function lazyPage(spec: PageSpec): () => ReactElement   // bringt eigene <Suspense>-Grenze mit
```

Fehlt das Modul, rendert ein `MissingPage`-Platzhalter, der den erwarteten Dateipfad anzeigt.

### 4.6 Session-Provider und Guards: `lib/session.tsx`

Exporte:

```ts
export function SessionProvider({ children }: { children: ReactNode })
export function useSession(): SessionContextValue
export function useCurrentUser(): User                 // wirft außerhalb geschützter Routen
export function useActiveGroup(): ActiveGroupValue
export function useRequiredGroupId(): string
export function useCanMutate(): { canMutate: boolean; reason: string | undefined }
export function useLogin() / useRegister() / useLogout()
export function RequireAuth({ children }: { children: ReactNode })
export function RequireActiveGroup({ children }: { children: ReactNode })
```

`SessionContextValue` trägt u. a. `isOnline` **und** `isOfflineData`:

```ts
const isOfflineData = user !== null && (!isOnline || meResult.isError);
```
— „wir zeigen, was das Gerät schon hatte". Ehrlicher als `navigator.onLine === false` allein, weil
das den Captive-WLAN-Fall nicht abdeckt.

Drei Mechaniken, die für toon-finance direkt gelten:

1. **Cache-Namensraum folgt dem User:**
   ```tsx
   useEffect(() => { if (user) setActiveCacheUser(user.id); }, [user]);
   ```
2. **`RequireAuth` rendert eine wiederhergestellte Session, auch wenn der Refetch scheiterte.**
   Der Kommentar ist die Begründung, die man nicht wegkürzen darf: *„It is not a way in: the cookie
   is still the only thing the API accepts, and a 401 once there IS a connection clears the cache and
   redirects."*
3. **Höchstens ein Redirect pro Mount** — ein `useRef` plus `safeNextPath`, das jedes Ziel ablehnt,
   das selbst mit `/login` beginnt. Ohne beides schaukelt sich
   `/login?next=%2Flogin%3Fnext%3D…` bis zur mehrere Kilobyte langen URL auf.

`useLogout` räumt in **`onSettled`, nicht `onSuccess`** auf:
```ts
onSettled: async () => {
  writeStorage(storageKeys.activeGroupId, null);
  queryClient.setQueryData(queryKeys.me(), null);
  queryClient.clear();
  setActiveCacheUser(null);          // löscht auch den lastUserId-Pointer
  await purgePersistedCache();
  await navigate({ to: "/login", replace: true });
}
```
Scheitert der Logout-Request (offline), muss der lokale Zustand trotzdem weg sein.

### 4.7 AppShell / TopBar / BottomTabBar / SideNav / nav-items

`components/layout/AppShell.tsx`:

```tsx
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <SideNav />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <TopBar />
        <OfflineBanner />
        <UpdateBanner />
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-gutter pt-4 pb-tabbar lg:pt-8 lg:[--gutter:2rem]">
          <InstallPrompt />
          {children}
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}
```

Vier Dinge daran sind hart erkämpft:
- **`<main>` besitzt `mx-auto max-w-5xl px-gutter pt-4 pb-tabbar`.** Eine Page-Root darf keins davon
  wiederholen; Page-Roots sind schlicht `flex flex-col gap-4` (oder `flex-1 flex flex-col`).
- **Die breitere Desktop-Gutter ist eine VARIABLE (`lg:[--gutter:2rem]`), kein zweites
  Padding-Utility** — die handgeschriebenen Utilities in `styles/index.css` werden nach allem
  Tailwind emittiert und würden `lg:px-8` schlagen.
- **`<main>` ist gleichzeitig wachsendes Flex-Item UND Flex-Column**, damit eine Page-Root `flex-1`
  sagen kann. `min-h-full` auf der Page-Root sieht äquivalent aus und ist messbar anders.
- **`BottomTabBar` wird NACH `<main>` gerendert** und ist `fixed inset-x-0 bottom-0 z-30`.

`PageHeader` liegt in derselben Datei und ist die einheitliche Screen-Überschrift
(`title`, `description`, `actions`, `above`).

`components/layout/nav-items.ts` ist die **einzige Quelle** der Navigation:

```ts
export interface NavItem {
  to: "/" | "/import" | "/groups" | "/settings" | "/collections" | "/tags" | "/shopping";
  labelKey: MessageKey;   // KEY, kein übersetzter String
  icon: LucideIcon;
  exact: boolean;         // nur die Startseite matcht exakt
}
export const NAV_ITEMS: readonly NavItem[] = [ … ];            // Tab-Bar + Sidebar-Kopf
export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [ … ];  // nur Sidebar
```

Zwei Regeln:
- **Die Items tragen Katalog-KEYS.** Ein zur Importzeit aufgelöstes Label friert die Tab-Bar auf der
  Sprache ein, die als erste geladen wurde.
- **Unter `lg` gibt es keine Sidebar**, also muss jedes `SECONDARY_NAV_ITEMS`-Ziel auch von einem
  Tab-Screen erreichbar sein, sonst ist es auf dem Handy unerreichbar.

### 4.8 Theme

`lib/theme.ts` — dreiwertig, „absent from localStorage means system":

```ts
export type ThemePreference = "system" | "light" | "dark";
export function readThemePreference(): ThemePreference
export function applyTheme(preference: ThemePreference): void  // data-theme auf <html>, + meta[theme-color]
export function useTheme(): { preference; setPreference; resolved: "light" | "dark" }
```

`index.html` trägt ein winziges Inline-Skript, das `data-theme` und die Hintergrundfarbe **vor dem
ersten Paint** setzt (kein Weißblitz), in `try/catch` wegen Private Mode.

`styles/index.css` definiert die Dark-Variante so, dass sie **beide** Zustände respektiert:

```css
@custom-variant dark {
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]) *, :root:not([data-theme="light"])) { @slot; }
  }
  &:where(:root[data-theme="dark"] *, :root[data-theme="dark"]) { @slot; }
}
```

### 4.9 PWA-Registrierung

`lib/pwa.ts` besitzt Registrierung und Update-Policy (Details in §5.5). Exporte:

```ts
export function registerServiceWorker(): void      // nur wenn import.meta.env.PROD
export function isUpdateReady(): boolean
export function subscribeUpdate(listener: () => void): () => void
export function applyUpdate(): void
export function useAppUpdate(): { ready: boolean; unsavedWork: boolean; apply: () => void }
export function useInstallPrompt(): InstallPromptState
export function useOnlineStatus(): boolean
```

### 4.10 UI-Primitives

`components/ui/index.ts` ist der einzige erlaubte Importpfad
(`import { Button, Card, useToast } from "@/components/ui"`). Konventionen aus dem Datei-Header:

```
- touch targets are at least 44px (`sm` sizes are for dense desktop toolbars),
- no hover-only affordances, focus-visible rings everywhere,
- colours come from the semantic tokens in styles/theme.css (dark mode is automatic),
- copy goes through the i18n catalogs, `error` props take a ready-to-render message.
```

Bestand: `ActionMenu, Avatar, Badge, Button (+buttonClasses), Card/CardHeader, ConfirmDialog,
Dialog, EmptyState, ErrorState, Field, IconButton, Input/PasswordInput (+controlClasses), Label,
Select, Skeleton/SkeletonList, Spinner/LoadingBlock/FullPageLoader, Switch, Tabs, Textarea,
ToastProvider/useToast`.

---

## 5 — Offline-Mechanik

Die Einkaufsliste ist das einzige Feature, das offline **geschrieben** werden kann. Vier Bausteine;
fehlt einer, bricht es auf schwer sichtbare Weise.

### 5.1 Baustein 1 — `setMutationDefaults`, nicht inline

`features/shopping/lib/offline.ts` wird von `app.tsx` **nur wegen des Seiteneffekts** importiert und
registriert am Ende der Datei:

```ts
registerShoppingMutationDefaults(queryClient);
```

```ts
export const SHOPPING_MUTATION_KEYS = {
  addItems:      ["toon","shopping","add-items"] as const,
  updateItem:    ["toon","shopping","update-item"] as const,
  removeItem:    ["toon","shopping","remove-item"] as const,
  check:         ["toon","shopping","check"] as const,
  clear:         ["toon","shopping","clear"] as const,
  addRecipe:     ["toon","shopping","add-recipe"] as const,
  addSuggestion: ["toon","shopping","add-suggestion"] as const,
} as const;

export function registerShoppingMutationDefaults(client: QueryClient): void {
  const shared = { networkMode: "offlineFirst", retry: 1 } as const;

  const commit = (data: ShoppingListDetailResponse, variables: ShoppingTarget) => {
    client.setQueryData(queryKeys.shoppingList(variables.groupId, variables.listId), data);
    void client.invalidateQueries({ queryKey: queryKeys.shoppingLists(variables.groupId) });
  };

  client.setMutationDefaults(SHOPPING_MUTATION_KEYS.check, {
    ...shared,
    mutationFn: (v: ItemVariables) =>
      checkShoppingItem(v.groupId, v.listId, v.itemId, { mutationId: v.mutationId }),
    onMutate: (v: ItemVariables) =>
      patchCache(client, v.groupId, v.listId, (cur) => removeFromCache(cur, v.itemId, { asBought: true })),
    onError: (_e, v: ItemVariables, snapshot) => rollbackCache(client, v.groupId, v.listId, snapshot as never),
    onSuccess: commit,
  });
  …
}
```

**Warum nicht inline in `useMutation`:** eine dehydrierte Mutation behält ihre `variables`, aber
**keine Funktion** — beim Replay wird die `mutationFn` über den `mutationKey` gefunden. Die Defaults
müssen also existieren, **bevor** der Persister restauriert.

### 5.2 Baustein 2 — `networkMode: "offlineFirst"`

Das ist, was einen fehlgeschlagenen Write **pausieren** statt scheitern lässt. Ohne das gibt es
nichts zu persistieren. Die zugehörige Read-Query hat es ebenfalls
(`shoppingListQuery`, §4.1), sonst hängt ein Kaltstart im Keller ewig in `pending`.

### 5.3 Baustein 3 — `shouldPersistMutation` + Flush

`lib/persist.ts`:

```ts
const PERSISTED_MUTATION_KEYS = new Set(["shopping"]);

export function shouldPersistMutation(mutation: {
  state: { status: string; isPaused: boolean };
  options: { mutationKey?: readonly unknown[] | undefined };
}): boolean {
  if (!mutation.state.isPaused) return false;         // NUR pausierte
  const key = mutation.options.mutationKey;
  if (!Array.isArray(key) || key[0] !== "toon") return false;
  return typeof key[1] === "string" && PERSISTED_MUTATION_KEYS.has(key[1]);
}
```

Nur **pausierte** Mutationen, denn eine bereits abgeschlossene hat den Server erreicht — sie beim
nächsten Start erneut auszuführen wäre genau der Doppel-Apply, gegen den das Ledger existiert.

Der Flush steht in `app.tsx`:
```tsx
onSuccess={() => { void queryClient.resumePausedMutations().catch(() => undefined); }}
```
`resumePausedMutations()` spielt in **Erstellungsreihenfolge** ab („add Milch" dann „check Milch")
— deshalb bleiben diese Mutationen auf dem seriellen Default.

Die drei Bedingungen, die ein Key erfüllen muss, um in `PERSISTED_MUTATION_KEYS` zu dürfen (wörtlich
sinngemäß aus dem Kommentar): (1) mit `setMutationDefaults` registriert, (2) der Endpoint ist
replay-sicher (Ledger), (3) ein verspäteter Replay ist nicht destruktiv. Auth-, Gruppen- und
Rezept-Mutationen sind ausgeschlossen und müssen es bleiben.

### 5.4 Baustein 4 — client-gemünzte `mutationId`

```ts
function newMutationId(): string { return crypto.randomUUID(); }
// …erzeugt beim AUFRUF, nie in mutationFn (die läuft beim Replay erneut)
check: (itemId: string) => mutation.mutate({ groupId, listId, itemId, mutationId: newMutationId() }),
```

Serverseitig (`services/shopping/idempotency.ts`):

```ts
export const MUTATION_LEDGER_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function claimMutation(db: DbLike, listId: string,
                                    mutationId: string | undefined): Promise<boolean> {
  if (!mutationId) return true;                       // kein Id = kein Replay-Schutz gewünscht
  const inserted = await db.insert(shoppingMutations)
    .values({ id: mutationId, listId, appliedAt: nowMs() })
    .onConflictDoNothing()
    .returning({ id: shoppingMutations.id });
  return inserted.length > 0;                          // false = schon angewendet
}
export async function pruneMutationLedger(db: DbLike): Promise<void>
```

**Der Claim ist ein INSERT auf den Primary Key, kein SELECT-dann-Write** — zwei Replays derselben Id
könnten sonst beide „nicht angewendet" lesen. Die zweite Anfrage wendet nichts an und gibt den
**aktuellen Zustand** zurück.

Warum das kritisch ist, in den Worten des Codes: *„Because shopping items merge by quantity, the
result is not a visible duplicate row you would notice — it is '500 g Mehl' quietly becoming
'1 kg Mehl'. You find out at the till."* **Für ein Kassenbuch ist das Argument noch stärker:** eine
doppelt gebuchte Ausgleichszahlung ist ein falscher Saldo, keine falsche Einkaufsliste.

Zusatzregel: `mutationId` wird für idempotente Operationen (z. B. „Liste leeren") absichtlich
**nicht mitgesendet** — sonst verbraucht man Ledger-Einträge ohne Nutzen.

### 5.5 `lib/persist.ts` im Ganzen

```ts
const DB_NAME = "toon-recipe"; const DB_VERSION = 1; const STORE_NAME = "query-cache";
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PERSIST_BUSTER = "v2";
export function cacheKeyForUser(userId: string): string { return `user:${userId}`; }

export function activeCacheUser(): string | null
export function setActiveCacheUser(userId: string | null): void   // PURGT bei Wechsel
export function isPersistenceAvailable(): boolean
export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean
export function shouldPersistMutation(mutation: …): boolean
export function createIndexedDbPersister(): Persister
export async function purgePersistedCache(): Promise<void>
```

Vier Regeln des Daten-Leck-Schutzes (alle vier müssen gelten):

1. **Der IndexedDB-Key enthält die User-Id** — zwei Konten können den Blob des anderen gar nicht lesen.
2. **Der Key folgt dem AKTUELLEN User zur Schreibzeit.** Der Persister liest den Modul-State bei
   jedem Aufruf, statt eine Id zu capturen — ein beim Boot gebundener Persister würde die frisch
   geladenen Daten von User B unter dem Key von User A ablegen.
3. **Kontowechsel purgt zuerst** (`setActiveCacheUser` löscht bei echter Änderung, Logout ruft es
   mit `null`).
4. **Eine Allow-List entscheidet, was überhaupt geschrieben wird** — ein später hinzugefügter
   Endpoint ist per Default ausgeschlossen.

```ts
const PERSISTED_GROUP_SEGMENTS = new Set([
  "recipes","recipe","tags","collections","collection","detail","shopping-lists","shopping-list",
]);

export function shouldPersistQuery(query): boolean {
  if (query.state.status !== "success") return false;          // pending/failed nie: läse sich als Datenverlust
  if (query.state.data === null || query.state.data === undefined) return false;
  const key = query.queryKey;
  if (!Array.isArray(key) || key[0] !== "toon") return false;
  if (isBootstrapKey(key)) return true;                        // ["toon","me"]
  if (key[1] !== "group") return false;
  const segment = key[3];
  return typeof segment === "string" && PERSISTED_GROUP_SEGMENTS.has(segment);
}
```

**`/api/auth/me` WIRD persistiert** — sonst gibt es gar keinen Offline-Modus: eine installierte App
im Flugmodus erführe nie, wer angemeldet ist. Ausgeschlossen bleiben `["toon","sessions"]` (immer
live) und mid-edit-Zustände.

`PERSIST_BUSTER` wird hochgezählt, sobald eine Änderung einen alten Blob falsch machen würde
(Key-Umbenennung, Response-Shape). Kosten: ein Kaltreload pro Gerät.

IndexedDB statt localStorage, ohne `idb-keyval`-Dependency: ein Object Store, ein Key pro Konto,
~40 Zeilen rohes IDB. **Jede Operation schluckt ihren eigenen Fehler** — Persistenz ist ein Bonus,
ein Browser ohne IndexedDB muss auf „online only" degradieren, nie crashen.

### 5.6 Der Service Worker darf die Offline-Daten NICHT anfassen

`vite.config.ts`, `RUNTIME_CACHING`, Reihenfolge ist Semantik (die erste passende Regel gewinnt):

```ts
{ urlPattern: /\/api\/auth\//,                          handler: "NetworkOnly" },
{ urlPattern: /\/api\/groups\/[^/]+\/imports/,          handler: "NetworkOnly" },
{ urlPattern: /\/api\/groups\/[^/]+\/shopping-lists/,   handler: "NetworkOnly" },
{ urlPattern: /\/api\/groups\/[^/]+\/(recipes|tags|collections)/, handler: "NetworkFirst",
  method: "GET", options: { cacheName: "toon-api-recipes", networkTimeoutSeconds: 4,
    expiration: { maxEntries: 200, maxAgeSeconds: 7*24*60*60 },
    cacheableResponse: { statuses: [200] } } },
{ urlPattern: /\/uploads\//, handler: "CacheFirst", … },
```

Die Einkaufsliste ist **absichtlich `NetworkOnly`**, obwohl sie der offline-kritischste Screen ist:
ihre Offline-Kopie IST der persistierte TanStack-Cache — derselbe Speicher, in dem die pausierten
Mutationen liegen. Ein `NetworkFirst`-Treffer würde TanStack einen veralteten Body als frischen
Erfolg unterschieben, und `onSuccess` schriebe ihn über den optimistischen Zustand — abgehakte
Positionen wären still wieder da.

### 5.7 Update-Policy: `skipWaiting` ist AUS

`workbox`-Optionen:

```ts
navigateFallback: "/index.html",
navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
cleanupOutdatedCaches: true,
clientsClaim: true,
skipWaiting: false,
maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
```

Mit `skipWaiting: true` übernimmt ein neuer Worker ein Dokument, das noch das ALTE Bundle fährt; die
nächste Lazy-Route fragt den NEUEN Precache nach einer `assets/Page-<hash>.js`, die
`cleanupOutdatedCaches` beim Activate gelöscht hat → Lazy-Import-Fehler in die ErrorBoundary.

Also wartet der Worker, und `lib/pwa.ts` besitzt den Tausch:

- **Bemerken:** `registration.update()` bei `visibilitychange` (sichtbar), bei `online` und alle
  30 Minuten. Eine installierte iOS-App navigiert nur beim Start — ohne das braucht ein Deploy
  zwei Kaltstarts.
- **Entscheiden:** `announce()` ruft `applyUpdate()` sofort, **wenn `hasUnsavedWork()` false ist**;
  sonst fragt `UpdateBanner`. Ein `subscribeUnsavedWork`-Listener lässt ein gespeichertes Formular
  das wartende Update von selbst durchlassen.
- **Tauschen:** `postMessage({ type: "SKIP_WAITING" })` → `activated`/`controllerchange` → **ein**
  Reload (`reloadOnce()` ist geguarded). `controllerchange` ist auf `hadController` gegated, damit
  eine ERSTinstallation (die `clientsClaim` ebenfalls signalisiert) nicht neu lädt.
- **Kein Fallback-Timer.** Ein blinder Reload würde einen scheiternden Tausch bei jedem Start
  wiederholen — eine Boot-Schleife.

`lib/unsavedWork.ts` ist die einzige Stelle, die „würde ein Reload etwas verlieren?" beantwortet:

```ts
export function hasUnsavedWork(): boolean
export function subscribeUnsavedWork(listener: () => void): () => void
export function claimUnsavedWork(): () => void      // gibt die Release-Funktion zurück
export function useUnsavedWork(dirty: boolean): void
```

Ein **Zähler**, kein Boolean (zwei Screens können gleichzeitig dirty sein). Queued Mutations zählen
ausdrücklich **nicht** als unsaved work: sie liegen in IndexedDB und werden nach dem Reload
abgespielt.

---

## 6 — i18n-Schicht

### 6.1 Wo was liegt

```
packages/shared/src/i18n/     reine Runtime + SERVER-Katalog (Fehler, Validierung, Mail)
  locale.ts     LOCALES, Locale, DEFAULT_LOCALE, INTL_LOCALE, isLocale(), negotiateLocale()
  types.ts      CatalogEntry, PluralForms, NamespaceCatalog<Prefix>, LocaleCatalog<C>,
                MessageValues, Placeholders<S>, ValuesFor<E>, TranslateArgs<E>, Translator<C>
  translate.ts  interpolate(), pluralRulesFor(), createTranslator(), hasKey(), resolveCatalogKey()
  zod.ts        refineKey(), resolveZodIssue(), toValidationIssues()
  catalogs/     index.ts (SERVER_CATALOGS, resolveWireKey, serverText) · server.de.ts · server.en.ts

apps/web/src/lib/i18n/        React-Binding + UI-Kataloge + Locale-Store
  store.ts          ambienter Locale-Store + translate()
  I18nProvider.tsx  useT() / useLocale() / useLocalePreference()
  locale.ts         Geräte-Auflösung, LocalePreference, <html lang>
  catalogs/         index.ts + <ns>.de.ts / <ns>.en.ts (auth, recipes, import, shopping, groups, ui)
```

`packages/shared` bekommt die Runtime, weil **drei** Konsumenten sie brauchen und nur einer ein
Browser ist: die API rendert Fehler-/Mail-Copy, die Web-App rendert UI-Copy, und **die
Zod-Fehlermeldungen entstehen aus Schemas, die beide Seiten ausführen**. Die Runtime ist rein: nur
`Intl.PluralRules`/`Intl.NumberFormat` und String-Arbeit — kein React, kein `window`, kein `process`.

### 6.2 Die Typ-Konstruktion (das ist die Durchsetzung, kein Lint)

```ts
export type PluralForms = { readonly other: string } &
  { readonly [C in Exclude<Intl.LDMLPluralRule, "other">]?: string };
export type CatalogEntry = string | PluralForms;

/** Ein de-Katalog eines Namensraums: JEDER Key beginnt mit `${Prefix}.` */
export type NamespaceCatalog<Prefix extends string> = Record<`${Prefix}.${string}`, CatalogEntry>;

/** Die en-Form: gleiche Keys, gleiche string-vs-plural-Form pro Key. */
export type LocaleCatalog<C extends Record<string, CatalogEntry>> = {
  readonly [K in keyof C]: C[K] extends string ? string : PluralForms;
};

export type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;
export type ValuesFor<E extends CatalogEntry> = …
export type TranslateArgs<E extends CatalogEntry> =
  [keyof ValuesFor<E>] extends [never] ? [] : [values: ValuesFor<E>];

export interface Translator<C extends Record<string, CatalogEntry>> {
  <K extends keyof C & string>(key: K, ...args: TranslateArgs<C[K]>): string;
}
```

Anwendung, wörtlich aus den Katalogen:

```ts
// server.de.ts — QUELLE
export const serverDe = {
  "server.error.badRequest": "Ungültige Anfrage",
  "server.error.tooManyAttempts": "Zu viele Versuche. Bitte in {seconds} Sekunden erneut probieren.",
  …
} as const satisfies NamespaceCatalog<"server">;

// server.en.ts — ABGELEITET
import type { ServerCatalog } from "./server.de.ts";
export const serverEn: LocaleCatalog<ServerCatalog> = {
  "server.error.badRequest": "Invalid request",
  "server.error.tooManyAttempts": "Too many attempts. Please try again in {seconds} seconds.",
  …
};
```

Damit ist **ein fehlender Key in `en` ein Compile-Fehler**, ein überzähliger Key ein
Excess-Property-Fehler, und ein plural-vs-string-Mismatch ebenfalls ein Compile-Fehler.
`t()`-Keys sind `keyof C & string`, also kompiliert auch ein Tippfehler nicht.

Namensraum-Präfixe machen den Merge **reihenfolgeunabhängig**:

```ts
// apps/web/src/lib/i18n/catalogs/index.ts
const de = { ...authDe, ...recipesDe, ...importDe, ...shoppingDe, ...groupsDe, ...uiDe };
const en = { ...authEn, ...recipesEn, ...importEn, ...shoppingEn, ...groupsEn, ...uiEn };
export const CATALOGS = { de, en } as const;
export type MessageKey = keyof typeof de;
```

### 6.3 `t()` / `useT()` in Komponenten

```tsx
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const fromContext = useContext(LocaleContext);
  const fromStore = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return fromContext ?? fromStore;   // funktioniert auch ohne Provider (isolierter Unit-Test)
}

export function useT(): Translator<AppCatalog> {
  const locale = useLocale();
  return createTranslator(CATALOGS[locale], locale);
}
```

Der Provider hat **keinen eigenen State** — `useSyncExternalStore` hängt direkt am Modul-Store, also
rendert ein Sprachwechsel jeden Konsumenten neu, ohne State durch den Baum zu fädeln.

### 6.4 `translate()` — die Escape-Hatch

```ts
// apps/web/src/lib/i18n/store.ts
export function translate(key: MessageKey, values?: MessageValues): string {
  return createTranslator(CATALOGS[currentLocale], currentLocale)(key as never, values as never);
}
```

**Nur für Code AUSSERHALB von React**: `lib/api.ts`-Fallbacks, Toasts aus Event-Handlern, geworfene
Messages, ErrorBoundary. In einer Komponente typecheckt es und rendert dort veraltete Copy — genau
das macht es gefährlich. Der Preis der Bequemlichkeit ist die schwächere Signatur (kein
Placeholder-Check).

Weitere Store-Exporte:

```ts
export function getLocale(): Locale
export function subscribeLocale(callback: () => void): () => void
export function initLocale(locale: Locale): void        // aus main.tsx, EINMAL, kein Storage-Write
export function setLocalePreference(preference: LocalePreference): void
export function refreshSystemLocale(): void
export function setLocaleForTest(locale: Locale): void  // DOM-freier Seam für bun test
```

### 6.5 Server-Negotiation über `Accept-Language`

```ts
// packages/shared/src/i18n/locale.ts
export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "de";
export const INTL_LOCALE: Record<Locale, string> = { de: "de-DE", en: "en-GB" };
export function isLocale(value: string | null | undefined): value is Locale
export function negotiateLocale(acceptLanguageHeader: string | null | undefined,
                                fallback: Locale = DEFAULT_LOCALE): Locale
```

`negotiateLocale` ist bewusst simpel: auf Kommas splitten, `;q=` wegwerfen (die Liste kommt schon in
Präferenzreihenfolge), Primär-Subtag vor dem ersten `-` nehmen, den ersten unterstützten liefern.

```ts
// apps/api/src/lib/locale.ts
export const localeMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("locale", negotiateLocale(c.req.header("accept-language"), env.defaultLocale));
  await next();
};
export function requestLocale(c: Context<AppEnv>): Locale {
  return c.get("locale") ?? env.defaultLocale;   // das ?? ist load-bearing, siehe §2.1
}
```

Client-Seite: `lib/api.ts` setzt `"Accept-Language": getLocale()` bei **jedem** Request.
`Accept-Language` ist CORS-safelisted, kostet also keinen Preflight.

### 6.6 `ErrorText` / `ServerKey` / `resolveWireKey`

```ts
// packages/shared/src/i18n/catalogs/index.ts
export const SERVER_CATALOGS = { de: serverDe, en: serverEn } as const;

export function resolveWireKey(locale: Locale, key: string, values?: MessageValues): string | undefined
export function serverText(locale: Locale,
                           text: ServerKey | { key: ServerKey; values: MessageValues }): string
```

`resolveWireKey` ist **die einzige sanktionierte Art, einen untypisierten `string` zu übersetzen** —
er kam von der Leitung, das Bundle kennt ihn vielleicht nicht (Versionsversatz). Bei `undefined`
**muss** der Aufrufer auf die `message` der Leitung zurückfallen, **nie** auf den rohen Dotted-Key.
(Der Runtime-Missing-Key-Pfad von `renderEntry` gibt den Key zurück und warnt einmal im Dev-Modus —
das ist ausschließlich für diesen Wire-Fall gedacht.)

Zod-Fehler werden **nach dem Parse** in Keys aufgelöst, nicht per Error-Map, damit die Schemas
komplett i18n-frei bleiben:

```ts
export function refineKey(key: ServerKey): { params: { i18n: ServerKey } }
// Verwendung im Schema:
export const HttpUrlSchema = z.string().max(2000)
  .refine(isHttpUrl, refineKey("server.validation.httpUrlOnly"));

export function resolveZodIssue(issue: $ZodIssue, locale?: Locale)
  : { message: string; key: ServerKey; values: MessageValues }
export function toValidationIssues(error: ZodError, locale?: Locale)
  : Array<{ path: string; code: string; message: string; i18n: { key: ServerKey; values: MessageValues } }>
```

Die Key-Kandidaten pro Issue, vom Spezifischen zum Allgemeinen:

```
server.zod.field.<field>.<code>.<bound>
server.zod.field.<field>.<code>
server.zod.<code>.<facet>
server.zod.<code>
server.zod.fallback
```

Auf der Leitung trägt jedes `validation_failed`-Detail **beides**: `message` (in der verhandelten
Locale gerendert) und `i18n: { key, values }` (damit der Client in SEINER aktiven Locale
nachrendern kann).

`apps/web/src/lib/validation.ts` benutzt für Client-seitige Validierung **dieselbe** Funktion:

```ts
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  … errors[key] = resolveZodIssue(issue as $ZodIssue, getLocale()).message;
}
export function validate<Schema extends z.ZodType>(schema: Schema, value: unknown)
  : ValidationResult<z.output<Schema>>
export function apiFieldErrors(error: unknown): FieldErrors   // gibt {} für nullish zurück!
```

> **Gotcha:** eine idle TanStack-Mutation meldet `error: null`, nicht `undefined`. Deshalb gibt
> `apiFieldErrors` für nullish ein leeres Objekt zurück, sonst begrüßt ein Formular den Nutzer mit
> „Etwas ist schiefgelaufen", bevor er irgendetwas abgeschickt hat. `unknown` akzeptiert `null`, also
> fängt `tsc` einen Rückfall nie — der Unit-Test ist die Absicherung.

### 6.7 Die dritte Locale-Präferenz: `"system"`

```ts
// apps/web/src/lib/i18n/locale.ts
export type LocalePreference = Locale | "system";
export function readStoredLocale(): Locale | null
export function readLocalePreference(): LocalePreference   // Abwesenheit == "system"
export function resolveSystemLocale(): Locale              // navigator.languages
export function resolveDeviceLocale(): Locale              // stored ?? system
export function applyDocumentLocale(locale: Locale): void  // <html lang>
```

Kodierung exakt wie `ThemePreference`: **`"system"` LÖSCHT den localStorage-Key**, statt eine
aufgelöste Locale zu speichern, sodass das Gerät weiter dem Browser folgt. Die zwei Zustände zu
kollabieren, würde jemandem „Deutsch" anzeigen, der nie etwas gewählt hat und nur Deutsch sieht,
weil sein Handy es tut.

`useLocalePreference()` registriert einen `languagechange`-Listener, der **nur wirkt, solange die
Präferenz `"system"` ist** — unter einer expliziten Wahl neu aufzulösen würde den Nutzer still
überstimmen. Das PATCH auf `users.locale` sendet die **aufgelöste** Locale, nie `null` (die Spalte
existiert nur, damit Mail eine Sprache wählen kann), und bleibt **fire-and-forget** — als TanStack-
Mutation würde es offline pausieren, ohne Nutzen, und `shouldPersistMutation` würde es ohnehin nicht
persistieren.

Die zwei Sprachnamen im Picker sind **Autonyme und in JEDEM Katalog identisch** — wer versehentlich
in eine Sprache wechselt, die er nicht lesen kann, braucht einen Weg zurück.

### 6.8 Interface- vs. Content-Sprache

Die für toon-recipe wichtigste i18n-Regel (deutsche Rezept-Vokabeln dürfen nie durch `t()` laufen)
hat in toon-finance **kein direktes Gegenstück** — es gibt keine geparste Fachsprache. Was bleibt,
ist die abgeschwächte Form derselben Regel:

- **Ops-Ausgabe ist immer Englisch, nie gekeyt**: `console.*`, `env.ts`-Boot-Validierung,
  CLI-Skripte, geworfene Verbindungsfehler, `Error.message`. *„one language in a log is a feature."*
- **Ein String ist Interface-Sprache, bis er GESPEICHERT wird.** Der Default-Name einer neuen
  Kategorie ist UI-Copy im Moment der Erzeugung und danach schlichter Inhalt — **ein gespeicherter
  Wert wird beim Lesen nie neu übersetzt.**
- **Text, den der SERVER in eine Zeile schreibt, rendert in `env.defaultLocale`, nie in
  `requestLocale(c)`.** Sonst schreibt ein Import mit englischer UI einen englischen Satz dauerhaft
  in einen deutschen Datensatz.
- **Ein aus einem Ternär oder über zwei JSX-Zeilen zusammengesetzter Satz wird EIN Key**, nie ein
  Key pro Fragment — sonst ist er in einer Sprache mit anderer Wortstellung nicht übersetzbar.
- **Label-Maps, die zur Importzeit einfrieren, sind verboten.** Statt `roleLabels` gibt es
  `ROLE_LABEL_KEYS`; die Wire-Werte bleiben, nur das Label wandert in den Katalog.

---

## 7 — Test-Setup

### 7.1 Runner

`bun test` — kein Vitest, kein Jest. Root-Skript ist schlicht `"test": "bun test"`; jedes Workspace
hat dasselbe. **`bun test` führt alle Dateien in EINEM Prozess aus**, was die meisten Regeln unten
erklärt. Die Ausführungsreihenfolge der Dateien ist **Dateisystem-Reihenfolge, nicht alphabetisch** —
und die unterscheidet sich zwischen einem Arbeitsverzeichnis und einem frischen Clone.

### 7.2 Wie die DB in Tests gesetzt wird

`env.ts` erzwingt es, `NODE_ENV=test` setzt `bun test` selbst:

```ts
if (source.NODE_ENV === "test") {
  source.DATABASE_URL = source.TEST_DATABASE_URL ?? "file::memory:";
  source.SESSION_SECRET ??= "test-secret-test-secret-test-secret";
}
```
Eine Entwickler-`.env` kann Tests also nie auf die echte DB zeigen. Override: `TEST_DATABASE_URL`.

Zwei Test-Muster, beide im Repo vorhanden:

**A — eigene isolierte DB** (`test/smoke.test.ts`, das erklärte Template):

```ts
import { afterAll, describe, expect, test } from "bun:test";
import { createDatabase } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { app } from "../src/index.ts";

const { client, db } = createDatabase({ url: "file::memory:" });
await runMigrations(db);
afterAll(() => { client.close(); });
```

**B — geteilte DB des Prozesses** (`test/shopping.test.ts`, für Integrationstests, die durch `app`
gehen — der Router benutzt den `db`-Singleton):

```ts
import { db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { app } from "../src/index.ts";
await runMigrations(db);
```

Die Test-Harness baut Fixtures **direkt per drizzle**, nicht über die API, und fälscht die Session
durch eine Zeile in `sessions` plus ein Cookie:

```ts
async function createUser(name: string): Promise<TestUser> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${name.toLowerCase()}.${id.slice(0,8)}@toon.test`, name, emailVerified: true });
  const sessionId = crypto.randomUUID().replaceAll("-", "");
  await db.insert(sessions).values({ id: sessionId, userId: id, expiresAt: Date.now() + 30*24*3600*1000 });
  return { id, name, cookie: `toon_session=${sessionId}` };
}

async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const headers: Record<string,string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, { method: options.method ?? "GET", headers,
                             body: options.body === undefined ? undefined : JSON.stringify(options.body) });
}
```

Kein Port wird gebunden — `app.request()` geht direkt in Hono.

### 7.3 Seams statt `mock.module`

**Die Regel, wörtlich aus CLAUDE.md:** *„`mock.module` LEAKS ACROSS TEST FILES and bun never
restores it, and the file execution order is FILESYSTEM order, not alphabetical."* Beide Hälften
zählen: ein in Datei A installierter Stub steht in Datei B noch, und welche Datei „B" ist, hängt vom
Rechner ab — der Fehler erscheint also nur manchmal.

Deshalb: **ein expliziter Setter-Seam pro austauschbarer Abhängigkeit.** Kanonische Beispiele:

```ts
// services/mail/index.ts
export function getMailer(): Mailer
export function setMailer(next: Mailer | null): void      // null = konfigurierten Adapter zurück
export function isMailerOverridden(): boolean

// services/import/capabilities.ts
let override: boolean | null = null;
export function isOcrImportEnabled(): boolean { return override ?? env.ocrImportEnabled; }
export function setOcrImportEnabled(value: boolean | null): void { override = value; }
```

Die dazugehörige Disziplin: **eine Datei, die einen Seam setzt, MUSS ihn in `afterAll`/`afterEach`
zurückgeben** (`setMailer(null)`, `setOcrImportEnabled(null)`, `setLocaleForTest(DEFAULT_LOCALE)`),
sonst erbt jede spätere Datei die Einstellung. Für toon-finance sind die naheliegenden Seams:
`setMailer`, `setLocaleForTest` und eine `setClock()`/`nowMs()`-Indirektion für zeitabhängige
Fixkosten-Berechnungen (toon-recipe hat `nowMs()` bereits in `services/groups/support.ts`, genau als
„one place so tests can reason about ordering").

Wo `mock.module()` unvermeidbar ist, gelten zwei Zusatzregeln: die Datei gibt das Modul in
`afterAll` zurück, und sie snapshottet den echten Export **by value** zur Modul-Eval-Zeit
(`const real = ns.thing`) — ein Namespace-Objekt ist eine LIVE-View auf die Registry, also stellt
`mock.module(spec, () => namespace)` den Stub über sich selbst wieder her und tut still nichts.

### 7.4 Wo Tests hingehören

- **Reine Fachlogik → `packages/shared/test/*.test.ts`.** Vorhanden: `duration`, `i18n`,
  `ingredients`, `numbers`, `schemas`, `shopping`, `units`. Der Stil ist tabellengetrieben:
  ```ts
  test.each([
    ["Mehl", "mehl"], ["Möhren", "mohren"], ["Grieß", "griess"],
  ])("%s -> %s", (input, expected) => { expect(nameKey(input)).toBe(expected); });
  ```
  **Für toon-finance ist das der Pflichtteil:** die Ledger-Mathematik und die
  Fixkosten-/Einkommensberechnung gehören hierhin, mit den Zahlen aus `Haushalt.xlsx` als Fixture.
- **Integrationstests der API → `apps/api/test/*.test.ts`** (nie `tests/`).
- **Web-Unit-Tests liegen NEBEN dem Code** (`src/lib/persist.test.ts`, `src/lib/validation.test.ts`,
  `src/lib/unsavedWork.test.ts`, `src/lib/i18n/i18n.test.ts`) und brauchen wegen
  `types: ["vite/client"]` den `bun:test`-Shim.
- **Rate-Limits sind unter Test deaktiviert**, Mail ist unter Test ein stiller `ConsoleMailer`
  (`env.isTest` in `services/mail/index.ts`), damit dutzende Invite-Mails die Testausgabe nicht
  begraben.

### 7.5 Die Verifikations-Gates

```bash
bun install
bun run typecheck    # tsc für packages/shared, apps/api, apps/web
bun test
bun run build        # vite build + PWA
bun run i18n:check   # Katalog-Parität
```

Plus, bei allem, was Persistenz oder Auth betrifft: `bun run db:migrate` und `bun run seed` gegen
eine frische `file:`-DB und danach der curl-Durchlauf aus der README. Bei allem, was Dockerfile,
Compose-Stack oder `staticWeb.ts` betrifft: Image bauen und Stack wirklich starten.

> **Gotcha:** *„Never verify a Docker build through a pipe"* (`docker build … | tail`) — der Exit-Code
> der Pipeline ist der von `tail`, ein fehlgeschlagener Build liest sich als Erfolg. Umleiten und
> `$?` prüfen.

CI (`.github/workflows/ci.yml`) fährt genau diese Gates: `setup-bun` mit `bun-version-file: .bun-version`,
Cache auf `~/.bun/install/cache` mit Key `bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}`,
`bun install --frozen-lockfile`, Typecheck, Test, Build (mit `PUBLIC_API_URL: ""`), und ein
Assert-Schritt, der die PWA-Ausgabe prüft:

```yaml
- name: Assert the PWA output exists
  run: |
    test -f apps/web/dist/index.html
    test -f apps/web/dist/sw.js
    ls apps/web/dist/*.webmanifest >/dev/null
```

Ein zweiter Job baut bei Pull Requests das Docker-Image für amd64 ohne Push.

---

## 8 — Docker / Deploy

### 8.1 Dockerfile-Aufbau

`ARG BUN_VERSION=1.3.14`, vier Stages, alle auf `oven/bun:${BUN_VERSION}-debian`:

| Stage | Zweck |
| --- | --- |
| `manifests` | nur `package.json`, `bun.lock`, **Root-`tsconfig.json`** und die drei Workspace-Manifeste. Ein reiner Quellcode-Change invalidiert damit nicht den Dependency-Install. |
| `web-build` | `--platform=$BUILDPLATFORM` — der Web-Bundle-Output ist architekturunabhängiges JS, native Bauen statt QEMU ist der Unterschied zwischen ~4 und ~40 Minuten. `ENV PUBLIC_API_URL=""`. |
| `deps` | `bun install --frozen-lockfile --production` **für die Zielarchitektur**. |
| `runtime` | Debian, `tini` als PID 1, Quellen + `dist` + node_modules, `USER bun`, `VOLUME ["/app/data"]`, `EXPOSE 3001`, HEALTHCHECK gegen `/api/health`. |

Warum Debian statt Alpine: prebuilt-glibc-Binaries (`sharp`) — auf musl würde auf dem Ziel aus der
Quelle gebaut. Für toon-finance ohne `sharp` wäre Alpine grundsätzlich möglich; Debian zu behalten
ist trotzdem die risikoärmere Wahl und kostet ~40 MB.

Der Root-`tsconfig.json` in `manifests` ist **nicht optional**: vite/rolldown löst darüber das
`@toon/shared`-Path-Mapping auf, und sein Fehlen scheitert mit „Tsconfig not found" statt mit
irgendetwas über Pfade.

### 8.2 Bun Isolated Linker — WELCHE node_modules kopiert werden müssen

**Das ist die Falle, die einen bauenden, startenden und beim ersten Request sterbenden Container
erzeugt.** Bun 1.3 benutzt den ISOLATED Linker für Workspaces: die echten Pakete liegen im Store
unter `node_modules/.bun/<pkg>@<version>/`, und **jedes Workspace bekommt seinen EIGENEN
`node_modules`-Baum voller Symlinks** dorthin. `/app/node_modules` selbst enthält nichts außer `.bun`.

```dockerfile
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
```

Alle drei Pfade müssen kommen, sonst: `Cannot find module '@libsql/client'` beim ersten Request.
`apps/web/node_modules` fehlt absichtlich — das Bundle ist schon gebaut.

### 8.3 Runtime-ENV im Image

```dockerfile
ENV NODE_ENV=production \
    API_PORT=3001 \
    WEB_DIST_DIR=/app/apps/web/dist \
    DATABASE_URL="file:/app/data/local.db" \
    UPLOAD_DIR=/app/data/uploads
…
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["bun", "apps/api/src/index.ts"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:'+(process.env.API_PORT??3001)+'/api/health'); process.exit(r.ok ? 0 : 1)"
```

`tini` bleibt auch ohne Subprozesse drin: es ist PID 1 des Containers und leitet Signale weiter.
Der Healthcheck geht über `/api/health`, also heißt „healthy" wirklich „Hono antwortet und env hat
validiert", nicht bloß „der Prozess existiert".

> **Gotcha:** `/app/data` ist ein VOLUME. Alles, was zur BUILD-Zeit dorthin geschrieben wird, ist zur
> Laufzeit unsichtbar. Sieht aus, als funktioniere es, und schlägt auf einem frischen Volume still fehl.

### 8.4 `WEB_DIST_DIR` und `middleware/staticWeb.ts`

Das ist der Kern von „ein Container, ein Origin":

```ts
export function webAppMiddleware(distDir: string): MiddlewareHandler
```

Verhalten, in der Reihenfolge des Codes:

1. Nur `GET`/`HEAD`, sonst `next()`.
2. `/api/*` und `/uploads/*` gibt es selbst zurück (`return next()`) — Gürtel und Hosenträger,
   weil die Fehlerform (SPA-Shell als Antwort auf einen API-Call) als unparsebarer JSON-Fehler
   meilenweit von der Ursache auftaucht.
3. `decodeURIComponent` in `try/catch`, ` ` ablehnen, `normalize()` + `".."` ablehnen,
   Prefix-Check gegen `root` (`candidate === root || candidate.startsWith(`${root}/`)`).
4. Existiert die Datei → ausliefern.
5. **Fehlt sie und sieht sie wie eine Datei aus (hat eine Endung) → echter 404**, kein SPA-Shell.
   HTML als Antwort auf ein fehlendes `.js` erzeugt einen MIME-Konsolenfehler, der nichts über das
   echte Problem sagt.
6. Sonst → `index.html` (Client-Route).

Die Caching-Regeln sind der eigentliche Zweck der Datei:

```
/assets/<name>-<hash>.<ext>   public, max-age=31536000, immutable
sw.js, index.html,            no-cache      <- NEVER_CACHE
registerSW.js, manifest.webmanifest
alles andere                  public, max-age=86400
```

**`sw.js` und `index.html` dürfen niemals gecacht werden** — cache eines von beiden und die App kann
sich nie wieder selbst updaten; das Symptom ist „der Server liefert tagelang eine veraltete App".

Zwei weitere Details: eine explizite `CONTENT_TYPES`-Map existiert vor allem wegen
`.webmanifest → application/manifest+json` (`Bun.file().type` antwortet
`application/octet-stream`, und ein Manifest mit falschem Typ wird still ignoriert → kein
Install-Prompt, keine PWA). Und `/sw.js` bekommt `Service-Worker-Allowed: /`.

### 8.5 `docker-compose.yml`

Drei Services, `name: toon-recipe`:

- **`app`** — kein published Port, nur `expose: ["3001"]`; `WEB_ORIGIN: "https://${TOON_HOSTNAME}"`,
  **`PUBLIC_API_URL: ""`** (absichtlich leer → relative URLs), `TRUST_PROXY: "1"` (nur weil Caddy
  X-Forwarded-For überschreibt), Volume `toon-data:/app/data`,
  `mem_limit: ${TOON_MEM_LIMIT:-768m}`, JSON-File-Logging mit `max-size: 10m` / `max-file: 3`
  (per YAML-Anchor `&logging` für alle drei Services wiederverwendet).
  `SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET fehlt - siehe docker/env.example}` — Compose
  bricht ab, wenn er fehlt.
- **`caddy`** — `caddy:2.11.4-alpine`, **gepinnt** (ein floating Tag könnte den TLS-Terminator unter
  einer laufenden Installation austauschen, und das Symptom eines schlechten Releases ist „die ganze
  Seite ist weg", auf einer Maschine, die man über eben diese Seite erreicht). Ports 80+443,
  Caddyfile read-only gemountet, Volumes `caddy-data` + `caddy-config`.
- **`mailpit`** — gepinnt, Port **`"127.0.0.1:8025:8025"`**, niemals öffentlich: die UI zeigt jeden
  Passwort-Reset- und Einladungslink. Erreichbar per `ssh -N -L 8025:127.0.0.1:8025`.
  (`ufw` schützt einen published Container-Port NICHT — Dockers iptables-Chain läuft zuerst; der
  Loopback-Bind ist die eigentliche Kontrolle.)

### 8.6 `docker/Caddyfile`

Warum es überhaupt einen Proxy gibt: **die PWA braucht einen Secure Context.** Ohne TLS registriert
sich kein Service Worker, also gibt es keinen Install-Prompt und kein Offline.

```caddyfile
{ admin off }

{$TOON_HOSTNAME} {
	tls { issuer {$TOON_TLS_ISSUER:acme} }
	encode zstd gzip
	reverse_proxy app:3001 {
		header_up X-Forwarded-For {remote_host}
		header_up X-Real-IP {remote_host}
		transport http { read_timeout 300s  write_timeout 300s }
	}
	header {
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Strict-Transport-Security "max-age={$TOON_HSTS_MAX_AGE:31536000}"
		-Server
	}
}

http://{$TOON_HOSTNAME} {
	handle /toon-root-ca.crt { root * /data/caddy/pki/authorities/local; rewrite * /root.crt; … }
	handle { redir https://{host}{uri} permanent }
}
```

Drei Dinge, die man nicht „aufräumt":

- **`header_up X-Forwarded-For {remote_host}` bleibt**, obwohl Caddy es als „unnecessary" loggt.
  Gemessen: Caddys Default verwirft einen client-gesetzten XFF (sicher); eine `trusted_proxies`-Zeile
  (häufiges Copy-Paste) macht den gefälschten Wert zum ERSTEN Eintrag — und den benutzt `clientIp()`,
  also wäre jedes Rate-Limit ein No-op. Der Overwrite überlebt das.
- **TLS hat zwei Modi und EINE Variable: `TOON_TLS_ISSUER`, Default `acme`.** `internal` (Caddys
  eigene CA) ist die LAN-Notlösung und braucht `TOON_HSTS_MAX_AGE=0` dazu, sonst sperrt ein gepinnter
  HSTS auf einem internen Namen aus. **Ein selbstsigniertes Zertifikat allein gibt keine PWA**: ein
  Origin mit nicht vertrauter CA ist auch nach dem Wegklicken kein Secure Context.
- **Keine `Content-Security-Policy`** — vite inlined ein kleines Bootstrap-Skript, eine Policy ohne
  passenden Hash macht die App still zur leeren Seite.

### 8.7 Release/Deploy

`.github/workflows/release.yml` baut und pusht das Image nach GHCR; `deploy.yml` ist optional
(`DEPLOY_ENABLED`) und fährt per SSH. Der Deploy-Key hat **keinen Shell-Zugang**: er ist in
`authorized_keys` an ein festes Kommando gebunden (`docker/toon-deploy.sh`), das drei Verben kennt
und die Image-Herkunft selbst festlegt.

---

## 9 — Übertragbare Gotchas, gefiltert auf eine Finanz-App

Reihenfolge grob nach Schadenspotenzial für toon-finance.

| # | Gotcha aus toon-recipe | Gilt hier? |
| --- | --- | --- |
| 1 | **Die Verbindungs-PRAGMAs in `db/client.ts` sind load-bearing, und `synchronous` muss pro Connection neu gesendet werden.** | **JA, aber mit anderer Entscheidung.** WAL + `busy_timeout` + `cache_size` übernehmen; `synchronous=NORMAL` **nicht** blind. Der Kommentar sagt selbst „the right trade for a recipe box, not for a ledger". Hier: `synchronous = FULL`, Begründung an dieselbe Stelle. |
| 2 | **Client-gemünzte `mutationId` + Ledger-Tabelle gegen Doppel-Apply beim Replay.** | **JA, verschärft.** Bei Rezepten ist der Schaden „1 kg statt 500 g Mehl"; hier ist er ein falscher Saldo. `claimMutation` als INSERT-mit-`onConflictDoNothing`, `mutationId` beim Aufruf erzeugen, nie in `mutationFn`. |
| 3 | **`setMutationDefaults` statt inline `useMutation`, weil eine dehydrierte Mutation keine Funktion behält.** | **JA.** Ohne das wirft `resumePausedMutations()` beim ersten Offline-Replay. Der Side-Effect-Import in `app.tsx` gehört dazu. |
| 4 | **`networkMode: "offlineFirst"` ist das, was einen Write pausieren statt scheitern lässt.** | **JA**, sowohl auf der Transaktions-Mutation als auch auf der Detail-Query des Ledgers. |
| 5 | **`shouldPersistMutation` persistiert NUR pausierte Mutationen einer kleinen Allow-List.** | **JA.** Allow-List hier: der `["toon","tx",…]`-Namensraum. Auth-, Haushalts- und Fixkostenplan-Mutationen bleiben draußen — ein Tage später abgespielter „Fixkostenplan geändert" ist keine Nettigkeit. |
| 6 | **Der persistierte Cache wird pro User-Id namensraumiert und bei Logout gelöscht; der Persister liest die Id bei jedem Aufruf.** | **JA, verschärft.** Zwei Personen, ein Haushalt, oft ein geteiltes Tablet — und die Query-Keys sind identisch. Alle vier Regeln aus §5.5 gelten. |
| 7 | **`/api/…`-Endpoints der offline-editierbaren Ansicht sind `NetworkOnly` im Service Worker.** | **JA.** Ein `NetworkFirst`-Treffer würde einen veralteten Ledger-Body als frischen Erfolg unterschieben und optimistische Buchungen überschreiben. |
| 8 | **`/api` und `/uploads` gehören nie ins `runtimeCaching`, `navigateFallbackDenylist` bleibt.** | **JA** für `/api`. `/uploads` entfällt mangels Uploads. Eine gecachte API-Antwort ist hier ein Datenkorrektheits-Bug ersten Grades. |
| 9 | **`skipWaiting` bleibt AUS**, `lib/pwa.ts` besitzt den Tausch, kein Fallback-Timer. | **JA**, unverändert — die App ist code-split, also gilt genau derselbe Lazy-Import-Bruch. |
| 10 | **`apps/api/tsconfig.json` inkludiert `test/**`, niemals `tests/`.** | **JA.** Reine Konvention, aber ein `tests/`-Ordner ist unsichtbar für `bun run typecheck`. |
| 11 | **Vite braucht `envDir: "../../"` + `envPrefix: ["VITE_","PUBLIC_"]`.** | **JA**, sonst wird `PUBLIC_API_URL` nicht inlined. |
| 12 | **Kein `baseUrl` in tsconfig (TS 7); `paths` je Workspace wiederholen.** | **JA.** |
| 13 | **`.px-safe` niemals neben `px-4`** — es ist ein flacher Override, und die handgeschriebenen Utilities werden nach Tailwind emittiert. `.px-gutter` benutzen, Breakpoint-Gutter als VARIABLE. | **JA**, 1:1 (dieselben Utilities, dasselbe `styles/index.css`). |
| 14 | **Sticky-Bars brauchen `.bottom-tabbar`, nie `bottom-0`.** | **JA.** Eine Finanz-App hat garantiert eine „Buchen"-Leiste am unteren Rand; mit `bottom-0` ist sie auf dem Handy unter der Tab-Bar und nicht antippbar. |
| 15 | **Eine Page-Root wiederholt `mx-auto max-w-5xl px-gutter pt-4 pb-tabbar` NICHT** — `<main>` macht das schon. Und ein sticky Bottom-Bar braucht eine ungebrochene Flex-Kette (`min-h-dvh` → `<main> flex-1 flex flex-col` → Page-Root `flex-1` → `flex-1`-Spacer). | **JA.** |
| 16 | **`controlClasses` trägt `min-w-0`**; in Grid-Templates `minmax(0,1fr)` statt `1fr`. | **JA.** Betragsfelder und Datumsfelder stehen typischerweise nebeneinander in `grid-cols-2` — genau der beschriebene Fall. |
| 17 | **Ein `<fieldset>` hat `min-inline-size: min-content` und braucht explizit `min-w-0`.** | **JA**, sobald ein Filterpanel gruppiert wird. |
| 18 | **Eine idle TanStack-Mutation meldet `error: null`, nicht `undefined`** — `apiFieldErrors` gibt `{}` für nullish. | **JA**, samt Unit-Test: `unknown` akzeptiert `null`, `tsc` fängt einen Rückfall nie. |
| 19 | **`mock.module` leakt über Testdateien; Ausführungsreihenfolge ist Dateisystem-Reihenfolge.** Expliziter Seam bevorzugen, Seam in `afterAll` zurückgeben. | **JA.** |
| 20 | **`bun test` erzwingt `DATABASE_URL=file::memory:` über `NODE_ENV=test`.** | **JA.** |
| 21 | **libSQL 0.17.4 verwirft eine `file::memory:`-DB beim Transaktions-Commit** → `withTransaction` degradiert; Tests, die Transaktionen anfassen, brauchen eine Temp-Datei-DB. | **JA, mit Nachdruck.** Ein Ledger, dessen Transaktionen im Test nie echt sind, testet die entscheidende Eigenschaft nicht. `TEST_DATABASE_URL` auf eine Temp-Datei setzen. |
| 22 | **Eine lokale libSQL-Datei ist eine serialisierte Spur; Nebenläufigkeit hilft nicht, billigere Queries schon.** | **JA**, praktisch irrelevant bei zwei Nutzern — aber die Regel „keinen Read-Pool bauen" gilt. |
| 23 | **`bun:sqlite` ist eine NEUERE SQLite als libSQL (3.53 vs. 3.45.1)** — DDL nur über `@libsql/client` verifizieren. | **JA**, falls je eine handgeschriebene Migration entsteht. |
| 24 | **`clientIp()` glaubt `X-Forwarded-For` nur bei `TRUST_PROXY=1`**; Caddy überschreibt es. | **JA.** Ohne das ist jedes Login-Rate-Limit ein No-op. |
| 25 | **Login hat zusätzlich einen IP-unabhängigen Eimer pro Adresse; `/password/forgot` antwortet 204 für bekannte UND unbekannte Adressen, Rate-Limit VOR dem Lookup.** | **JA.** Zwei Nutzer heißt nicht „kein Enumeration-Risiko" — es heißt, dass zwei Adressen die einzigen gültigen Ziele sind. |
| 26 | **Ein fehlgeschlagener Mailversand darf seine Aktion nie scheitern lassen** (`trySendMail`, immer nach dem Commit). | **JA.** Der Einladungslink ist gültig, weil die Zeile existiert. |
| 27 | **`delivered` allein ist nicht „eine Mail ging raus" — der ConsoleMailer resolved auch.** `mailDeliveryOf()` liefert die drei Zustände `sent` / `not_configured` / `failed`; die UI darf die letzten beiden nie als Erfolg rendern. | **JA.** Genau der Fall „Einladung an die zweite Person" ohne konfigurierten Mailer. |
| 28 | **Der Einladungs-Token ist die Capability; die eingeladene E-Mail wird bewusst nicht erzwungen; `acceptInvite` ist idempotent.** | **JA**, mit der Zusatzregel: ein Haushalt hat **genau zwei** Plätze, also muss `acceptInvite` einen dritten Beitritt mit einem eigenen `ERROR_CODE` (z. B. `household_full`) ablehnen — und ein bereits beigetretener zweiter Nutzer bleibt idempotent erfolgreich. |
| 29 | **`GET /api/auth/sessions` gibt Handles heraus, nie die Session-Id** (sie landet sonst im Access-Log). | **JA.** |
| 30 | **Session-Cookie: `HttpOnly; SameSite=Lax; Secure(prod); Path=/`, 30 Tage sliding, `lastUsedAt` maximal minütlich schreiben.** | **JA.** `SameSite=Lax` war für den OAuth-Rücksprung nötig; ohne OAuth wäre `Strict` möglich — aber `Lax` bleibt die richtige Wahl, damit ein Einladungslink aus einer Mail heraus funktioniert. |
| 31 | **`safeNextPath` muss Backslashes, Steuerzeichen und Leerzeichen ablehnen** (`/\evil.com` → `http://evil.com/`), und existiert bewusst zweimal (API + Web) — synchron halten. | **JA**, die Web-Hälfte (`RequireAuth` baut `?next=`) auf jeden Fall. |
| 32 | **Höchstens ein Redirect pro Mount in `RequireAuth`** (Ref + `safeNextPath`), sonst wächst `?next=` bis zur Kilobyte-URL. | **JA.** |
| 33 | **Ein `code` in `ERROR_CODES` ist ein Wire-Contract und wird nie umbenannt**; `message` ist lokalisiert, also **nie darauf branchen**. | **JA.** |
| 34 | **Ops-Ausgabe bleibt Englisch, UI-Copy geht immer durch den Katalog; `Error.message` trägt den KEY, nicht den Satz.** | **JA.** |
| 35 | **`translate()` ist nur für Code außerhalb von React** — in einer Komponente typecheckt es und rendert veraltete Copy. | **JA.** |
| 36 | **`"system"` ist die dritte Locale-Präferenz und bedeutet „Key aus localStorage entfernen".** | **JA.** |
| 37 | **Label-Maps, die zur Importzeit einfrieren, sind verboten** (`ROLE_LABEL_KEYS` statt `roleLabels`); Nav-Items tragen Keys. | **JA.** Kategorie-Labels und die vier Transaktionsarten sind genau solche Maps: **Wire-Wert `MINE_SPLIT`, Label über `TX_KIND_LABEL_KEYS`.** |
| 38 | **Ein zusammengesetzter Satz wird EIN Key, nie einer pro Fragment.** | **JA.** |
| 39 | **`apple-mobile-web-app-status-bar-style: black-translucent` ist verboten**; `viewport-fit=cover` + `<meta theme-color>` ist der Ersatz. | **JA**, 1:1 (dieselbe `index.html`-Basis). |
| 40 | **`block` schlägt `line-clamp-N`.** | **JA**, sobald Buchungstexte gekürzt werden. |
| 41 | **Ein Header bekommt EINEN Overflow-Trigger, keine Reihe von Icon-Buttons** (`ActionMenu`). | **JA.** |
| 42 | **Phone-Layout im echten Headless-Browser verifizieren, nicht durch Tailwind-Klassen lesen.** | **JA.** |
| 43 | **Sichtbarkeits-/Feature-Flags: die UI versteckt, aber der Server erzwingt** (`/api/health` `features`, 501 als Enforcement, „unknown zählt als unavailable"). | **TEILWEISE.** Kein OCR-Flag hier, aber das Muster ist gut für „SMTP konfiguriert?" — die Einladungs-UI soll wissen, ob sie „Mail unterwegs" oder „Link von Hand weitergeben" sagt. Das leistet allerdings schon `mailDeliveryOf()` (#27), also braucht es kein `features`-Feld. |
| 44 | **Bun 1.3 Isolated Linker: drei `node_modules`-Pfade ins Image kopieren.** | **JA**, wörtlich. |
| 45 | **`sw.js` und `index.html` dürfen nie gecacht werden; `.webmanifest` braucht `application/manifest+json`; ein fehlendes File MIT Endung muss 404 sein.** | **JA**, `staticWeb.ts` wird unverändert übernommen (nur die `/uploads`-Ausnahme entfällt). |
| 46 | **`/app/data` ist ein Volume — Build-Zeit-Schreibvorgänge sind zur Laufzeit unsichtbar.** | **JA.** |
| 47 | **Docker-Build nie durch eine Pipe verifizieren.** | **JA.** |
| 48 | **`TOON_TLS_ISSUER` mit `acme`-Default; `internal` braucht `TOON_HSTS_MAX_AGE=0`; ein selbstsigniertes Zertifikat allein gibt keine PWA.** | **JA.** |
| 49 | **Mailpit an `127.0.0.1` binden; `ufw` schützt einen published Container-Port nicht.** | **JA.** |
| 50 | **`header_up X-Forwarded-For {remote_host}` im Caddyfile bleibt.** | **JA.** |
| — | **Interface- vs. Content-Sprache als zwei Achsen** (`units.ts`, `FOLD_PAIRS`, `foldSql`, `recipes.*_fold`, `TESSERACT_LANGS`, `recipes.language`). | **NEIN.** toon-finance parst keine deutsche Fachsprache. Es bleibt nur die abgeschwächte Regel aus §6.8 (gespeicherte Werte nie neu übersetzen, Server-erzeugter Zeileninhalt in `env.defaultLocale`). |
| — | **`FOLD_PAIRS` / `foldSql()` / vorgefaltete Suchspalten / der 31-`replace()`-Parser-Overflow.** | **NEIN.** Es gibt keine Volltextsuche über hunderte Zeilen. Falls je eine Bezeichnungssuche kommt: `foldText()` in JS auf der Client-Seite, und **nicht** in SQL. |
| — | **`shoppingItemKey`s Separator ist U+001F**, Mengen-Merge, `preferredDisplayUnit`. | **NEIN.** Buchungen werden nie gemergt — jede Zeile ist ein Ereignis mit Datum. |
| — | **Thumbnails, signierte `/uploads`-URLs, `uploads:gc`, `warmThumbnail`.** | **NEIN**, es gibt keine Uploads. |
| — | **OCR-Concurrency-Gate, `withOcrTimeout` als `Promise.race`, SSRF-Guard, JSON-LD-`@graph`-Referenzen.** | **NEIN.** |
| — | **OAuth-Auto-Linking, `email_verified_at` als einziges Beweisstück, `arctic`-State/PKCE-Cookies.** | **NEIN**, kein OAuth. Die *Lehre* bleibt trotzdem gültig: wenn je ein „Account zusammenführen"-Feature kommt, darf es nie auf einem selbst gesetzten Boolean beruhen. |
| — | **Recipe-Filter in der URL (`RECIPE_FILTER_PARAMS`, `/search`-Redirect).** | **JA, sinngemäß.** Der Ledger-Filter (Zeitraum, Art, Kategorie, Tag) gehört in die URL, mit derselben `pick()`-Konstante — und eine Redirect-Route muss dieselben Params deklarieren, weil `validateSearch` vor `beforeLoad` läuft. |

---

## 10 — Was toon-finance ausdrücklich NICHT übernimmt

| Nicht übernommen | Warum |
| --- | --- |
| **OCR / Beleg-Foto / PDF-Import** (`services/ocr/*`, `services/import/ocr/*`, `IMPORT_OCR_ENABLED`, `TESSERACT_*`, `PDFTOPPM_BIN`, `WITH_OCR`-Build-Arg, `poppler-utils`/`tesseract-ocr` im Image) | Vom Nutzer ausgeschlossen. Spart ~120 MB Image, `sharp`, `unpdf`, das Concurrency-Gate, den 501-Capability-Mechanismus und den halben Dockerfile-Kommentar. |
| **URL-Importer inkl. SSRF-Guard, JSON-LD/Microdata/Site-Adapter** (`services/import/url/*`) | Kein Web-Import. Kein Fremdinhalt, den die App abholt — damit entfällt auch die gesamte SSRF-Angriffsfläche und `IMPORT_ALLOW_PRIVATE_HOSTS`. |
| **Import-Drafts als eigene Entität** (`import_drafts`, `routes/imports.ts`, Review-Screen, `useAutosave`, `ImportErrorText`) | Die xlsx-Übernahme ist ein EINMALIGES CLI-Skript, kein UI-Feature. Es schreibt direkt in die Ledger-Tabellen und weist seine Differenz gegen 86,46 EUR aus. Ein Draft-Review-Screen für einen einmaligen Lauf ist reine Wartungslast. |
| **Uploads, Thumbnails, signierte URLs, GC** (`lib/uploadUrls.ts`, `services/media/thumbnails.ts`, `scripts/uploads-gc.ts`, `GET /uploads/:filename`, `MAX_UPLOAD_BYTES`, `ACCEPTED_*_MIME_TYPES`, `sharp`) | Keine Bilder. Damit entfallen `maxRequestBodySize: 20 MB`, die Magic-Byte-Sniffing-Logik, `normalizeStoredUploadUrl` auf jedem Write und die `CacheFirst`-SW-Regel für `/uploads`. |
| **OAuth (Google + GitHub), `arctic`, `oauth_accounts`, `lib/oauth.ts`, alle `toon_oauth_*`-Cookies, `OAUTH_REDIRECT_BASE`** | Vom Nutzer ausgeschlossen: nur E-Mail + Passwort. Entfernt zugleich die gefährlichste Auth-Fläche des Referenz-Repos (Auto-Linking-Takeover) und den Grund, warum `SameSite` `Lax` statt `Strict` ist. |
| **E-Mail-Bestätigungs-Flow** (`email_verification_tokens`, `markEmailVerified`, `EmailVerificationCard`) | Er existierte in toon-recipe nur, um OAuth-Auto-Linking irgendwann sicher machen zu können. Ohne OAuth gibt es nichts, was diesen Zeitstempel als Beweis braucht. Passwort-Reset (`password_reset_tokens`, gehashter Single-Use-Token) bleibt. |
| **Gruppen mit N Mitgliedern und Rollen** (`groups`, `group_members`, `owner > admin > member`, `roleAtLeast`, `requireGroupRole(role)`, `GroupSwitcher`, `users.active_group_id`, `last_owner`-Fehlercode) | Genau zwei Personen, ein Haushalt, keine Rollen. Was **bleibt**, ist die Middleware-*Form*: ein `requireHousehold()`, das `c.set("household", …)` setzt, 404 für „gibt es nicht" und 403 für „gehört nicht dir" unterscheidet, und das kein Handler inline umgeht. Was ebenfalls bleibt, ist der Einladungs-Mechanismus (§2.12) — mit einem harten Limit von zwei Mitgliedern. |
| **Resend-Mailer** (`services/mail/resend.ts`, `MAIL_API_KEY`) | Ein `ConsoleMailer` als konfigurationsfreier Default plus ein `SmtpMailer` (dependency-frei über `node:net`/`node:tls`) reicht. Die `Mailer`-Schnittstelle, `setMailer()`, `trySendMail()`, `mailDeliveryOf()` und `redactAddress()` bleiben unverändert. |
| **Mehrere Listen / Merge-Algebra / Katalog** (`shopping_lists`, `shopping_list_catalog`, `merge_key`, `unitBucket`, `addAmounts`, „Häufig gekauft") | Buchungen werden nie zusammengeführt. Was aus diesem Feature-Vertikal übernommen wird, ist ausschließlich die **Offline-Mechanik** (§5) und das **Idempotenz-Ledger** — nicht das Datenmodell. |
| **Deutsche Inhalts-Vokabeln + Faltung** (`units.ts`, `ingredients.ts`, `numbers.ts` als Parser, `text.ts`'s `FOLD_PAIRS`/`foldText`, `foldSql()`, `likeStoredFold()`, `*_fold`-Spalten, `backfillFoldedColumns`) | Es gibt keine deutsche Fachsprache zu parsen und keine Volltextsuche über tausende Zeilen. `packages/shared` enthält stattdessen die Ledger- und Fixkosten-Mathematik in ganzzahligen Cent. |
| **Kochspezifische UI** (`CookMode`, `ServingsScaler`, `print.css`, `useIsWideViewport`-Kartenumschaltung, `RecipeFilters`) | Fachlich irrelevant. Die generischen Primitives (`components/ui/*`), das Layout-Gerüst (`AppShell`/`TopBar`/`BottomTabBar`/`SideNav`/`nav-items.ts`) und `styles/index.css` inkl. `.px-gutter` / `.bottom-tabbar` / `.pb-tabbar` werden vollständig übernommen. |
| **`scripts/i18n-check.ts` + das `bun run i18n:check`-Gate** | Es ist ein grep-basiertes Werkzeug für eine *Portierung* bestehender deutscher Copy (es prüft Byte-Identität gegen einen Basis-Commit und liefert bekanntermaßen False Positives). toon-finance schreibt seine Kataloge von Anfang an — die Typkonstruktion (`LocaleCatalog<typeof de>`) ist hier die vollständige Durchsetzung, und `bun run typecheck` ist das Gate. |

---

## Anhang — Die Kurzform als Checkliste für Tag 1

1. Wurzel: `package.json` (workspaces `apps/*`, `packages/*`), `tsconfig.json` (kein `baseUrl`,
   `paths` auf `@toon/shared`), `.env.example`, `.gitignore`, `scripts/{dev,typecheck}.ts`,
   `.bun-version` = `1.3.14`.
2. `packages/shared` zuerst: `src/index.ts` als Barrel, `src/schemas/common.ts` mit `ERROR_CODES`,
   `ApiErrorSchema`, `listResponse()`, `PaginationQuerySchema`, `MailDeliverySchema`; dann
   `src/i18n/*` (locale/types/translate/zod/catalogs) — **die Typkonstruktion ist die Sperre**.
3. `apps/api`: `env.ts` (lädt Root-`.env`, `process.exit(1)` bei Fehler, Test-Defaults),
   `db/{schema,client,migrate}.ts` (PRAGMAs bewusst NEU entscheiden), `lib/{errors,http,types,
   cookies,locale}.ts`, `middleware/{session,household,staticWeb}.ts`, dann Router.
4. `apps/web`: `vite.config.ts` (`envDir`, `envPrefix`, PWA mit `skipWaiting: false`,
   `navigateFallbackDenylist`), `lib/{api,queries,query-client,session,persist,storage,theme,pwa,
   cn,format,validation,unsavedWork}.ts`, `lib/i18n/*`, `components/ui/*`, `components/layout/*`,
   `router.tsx` + `lib/lazy-page.tsx`.
5. Offline zuletzt, aber vollständig: die vier Bausteine aus §5 gemeinsam, nie einzeln.
6. Docker/Caddy erst, wenn `bun run build` grün ist — und dann das Image wirklich starten.
