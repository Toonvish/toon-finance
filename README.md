# toon-finance

Haushaltskasse für **genau zwei Personen** (Eric und Sandy): gemeinsame Ausgaben erfassen,
aufteilen und über einen einzigen Saldo ausgleichen. Herzstück ist der **Fixkostenplan**, der aus
den beiden Einkommen und den festen Kosten jeden Monat den einkommensproportionalen Anteil der
zweiten Person automatisch bucht. Deutschsprachige Oberfläche (de Default, en zusätzlich), EUR,
`de-DE`-Formatierung. Installierbare PWA mit Offline-Erfassung.

**Verbindlich für jede Änderung:** [`docs/spec.md`](docs/spec.md) (API-Vertrag, Datenbankschema,
Datei-Layout), [`docs/ledger-spec.md`](docs/ledger-spec.md) (Fachlogik, Cent-Arithmetik,
`Haushalt.xlsx`-Import) und [`CLAUDE.md`](CLAUDE.md) (gesperrte Entscheidungen, Gotchas). Dieses
README beschreibt nur Setup und Struktur.

## Stack

| Teil | Technologie |
| --- | --- |
| Monorepo | Bun Workspaces (`apps/*`, `packages/*`), Bun 1.3.14 |
| `apps/api` | Bun.serve + Hono, drizzle-orm, `@libsql/client`, `@hono/zod-validator`, zod |
| `apps/web` | React 19 + Vite + TypeScript, TanStack Router, TanStack Query, Tailwind CSS v4, vite-plugin-pwa |
| `packages/shared` | Zod-Schemas + abgeleitete Typen + reine Fachlogik — als `@toon/shared` importiert |
| Tests | `bun test` (Ledger-/Plan-/Import-Unit-Tests mit `Haushalt.xlsx`-Fixtures, API-Integrationstests) |

TypeScript `strict: true` überall, kein `any` in exportierten Signaturen, kein `baseUrl` (TS 7).

## Struktur

```
apps/api/src/
  index.ts             Hono-Bootstrap: Fehler-Envelope, Logger, /api/health, Router-Mounts
  env.ts                zod-validiertes Env (lädt die ROOT-.env selbst, exit(1) mit Liste)
  db/{schema,client,migrate}.ts
  routes/  services/  middleware/  scripts/
  test/                 ALLE API-Tests (test/, NICHT tests/ — tsconfig inkludiert nur test/**)
apps/web/src/
  main.tsx  app.tsx  router.tsx
  lib/{api,queries,session,i18n,...}.ts
  components/{ui,money,layout}/
  features/{auth,settings,household,transactions,overview,plan,categories}/
packages/shared/src/
  money.ts  ledger.ts  period.ts  plan.ts  categories.ts  tags.ts
  schemas/*.ts  i18n/*.ts
```

Der `Haushalt.xlsx`-Import (der einmalige Parser + das CLI-Skript) liegt bei `apps/api/scripts/
import-xlsx.ts` und `apps/api/scripts/import/{xlsx-reader,amounts,dates,categorize,rent}.ts` — nicht
unter `packages/shared/src/import/`, wie `docs/spec.md` §5.2 ursprünglich vorsah (Abweichung
dokumentiert in §8.2 #16).

Der vollständige Baum mit jedem anzulegenden Pfad und den Besitzer-Tags für parallele Arbeit steht
in `docs/spec.md` §5.

## Setup

Voraussetzung: [Bun](https://bun.sh) 1.3.14 (siehe `.bun-version`).

```bash
bun install
cp .env.example .env        # SESSION_SECRET setzen (openssl rand -hex 32 genügt lokal)
bun run db:migrate
bun run seed                  # Demo-Haushalt für die lokale Entwicklung
bun run dev                   # API auf :3001, Web auf :5173 (Vite proxied /api)
```

Danach: `http://localhost:5173`.

Der einmalige Import von `Haushalt.xlsx` (kein UI-Feature, ein CLI-Skript) läuft gegen einen
existierenden Haushalt mit zwei Mitgliedern. Vom Repo-Root aus **mit dem Skriptpfad**, nicht über
`bun run import:xlsx` — das `--filter @toon/api`-Script wechselt das Arbeitsverzeichnis nach
`apps/api`, wo ein relativer `Haushalt.xlsx`-Pfad ins Leere zeigt:

```bash
bun run apps/api/scripts/import-xlsx.ts Haushalt.xlsx --dry-run     # nur der Report, keine Datenbank
bun run apps/api/scripts/import-xlsx.ts Haushalt.xlsx --household <id>
```

### Smoke-Test

```bash
curl -s http://localhost:3001/api/health | jq
# { "status": "ok", "version": "0.1.0", "time": "...", "database": "file", "mail": "console" }
```

## Skripte (Root)

| Skript | Zweck |
| --- | --- |
| `bun run dev` | API + Web parallel (`scripts/dev.ts`) |
| `bun run dev:api` / `dev:web` | nur eine Seite |
| `bun run build` | `apps/web` bauen (vite build + PWA) |
| `bun run start` | API im Produktionsmodus (`apps/api`) |
| `bun test` | alle Workspaces (`bun test`) |
| `bun run typecheck` | `tsc --noEmit` sequenziell in `packages/shared`, `apps/api`, `apps/web` |
| `bun run db:generate` | `drizzle-kit generate` gegen `apps/api/src/db/schema.ts` |
| `bun run db:migrate` | Migrationen anwenden |
| `bun run db:studio` | `drizzle-kit studio` |
| `bun run seed` | Demo-Haushalt für die lokale Entwicklung |
| `bun run import:xlsx` | einmaliger CLI-Import von `Haushalt.xlsx` (`--household <id>`, `--dry-run`, `--excel-text-quirk`); vom Root aus siehe die Fußnote unten bei „Setup" — relative Dateipfade brauchen den Skriptpfad, nicht dieses Filter-Script |

**Vier Verifikations-Gates**, alle müssen grün sein, bevor irgendetwas „fertig" heißt:

```bash
bun install
bun run typecheck
bun test
bun run build
```

Es gibt **kein** `i18n:check` — die Typkonstruktion (`LocaleCatalog<typeof de>`) ist die vollständige
Durchsetzung, `bun run typecheck` ist das Gate.

## Docker

Ein Container: die API serviert die gebaute PWA über `WEB_DIST_DIR`, kein CORS, kein zweiter
Webserver. Caddy davor terminiert nur TLS (die PWA braucht einen Secure Context).

```bash
docker build -t toon-finance:local . > /tmp/build.log 2>&1; echo $?   # NICHT durch eine Pipe prüfen
cp docker/env.example .env && nano .env    # TOON_HOSTNAME + SESSION_SECRET setzen
docker compose up -d
```

Details, Zertifikats-Modi (`acme` vs. `internal`) und der Mailpit-Sink: `docker/Caddyfile` und
`docker/env.example` sind vollständig kommentiert.

## Lizenz

Privates Projekt, kein öffentliches Repository.
