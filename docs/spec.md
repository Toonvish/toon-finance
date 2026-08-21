# toon-finance — verbindliche Spezifikation

**Autoritativ.** Dieses Dokument ist die Vorgabe für alle Implementierungs-Agenten. Sie bauen exakt
danach und legen Dateien an exakt den in [§5](#5-datei-layout) festgelegten Pfaden an. Ein Pfad, der
hier fehlt, wird nicht gebaut. Ein Text, der hier nicht steht, wird nicht erfunden.

Vorgelagert und weiterhin gültig:

* `docs/reference-architecture.md` — was von `toon-recipe` übernommen wird, wörtlich, mit Versionen.
* `docs/ledger-spec.md` — die Fachlogik, die Cent-Arithmetik, der xlsx-Import, 99 Testvektoren.

Wo dieses Dokument von einem der beiden abweicht, gewinnt **dieses** Dokument; jede Abweichung ist in
[§8.2](#82-abweichungen-von-den-recherche-dokumenten) benannt und begründet.

Prosa ist Deutsch (Nutzer-Sprache dieses Repos). Code, Bezeichner, Ops-Ausgaben und Log-Zeilen sind
Englisch. Deutsche Zeichenketten in diesem Dokument sind **Daten** (Katalog-Werte, Blatt-Beschriftungen),
keine Prosa.

---

## Inhalt

1. [Produkt und gesperrte Entscheidungen](#1-produkt-und-gesperrte-entscheidungen)
2. [Datenbankschema](#2-datenbankschema)
3. [API-Vertrag](#3-api-vertrag)
4. [Screens und Navigation](#4-screens-und-navigation)
5. [Datei-Layout](#5-datei-layout)
6. [i18n-Key-Inventar](#6-i18n-key-inventar)
7. [Test-Plan](#7-test-plan)
8. [Offene Punkte und Abweichungen](#8-offene-punkte-und-abweichungen)

---

## 1. Produkt und gesperrte Entscheidungen

### 1.1 Was die App ist (10 Zeilen)

1. **toon-finance** ist eine Haushaltskasse für **genau zwei Personen**, die zusammenwohnen.
2. Beide erfassen Ausgaben; die App führt daraus **einen einzigen Saldo**: wer schuldet wem wie viel.
3. Eine Buchung ist eine von **vier Arten**: geteilt (ich gezahlt), geteilt (die andere Person gezahlt),
   zu 100 % für die andere Person, oder eine Ausgleichszahlung.
4. Jede Buchung trägt **eine Kategorie und beliebig viele freie Tags**; ein deutsches Default-Set ist
   vorgegeben.
5. Das Herzstück ist der **Fixkostenplan**: aus Fixkostenpositionen und den beiden Gehältern wird ein
   **einkommensproportionaler Monatsanteil** berechnet und Monat für Monat automatisch gebucht.
6. Der Saldo wird durch **Ausgleichszahlungen** getilgt; „Jetzt ausgleichen" schreibt genau eine Buchung.
7. Die Oberfläche ist **deutsch (Default) und englisch**, EUR, `de-DE`-Formatierung, alle Beträge in
   **ganzzahligen Cent** gespeichert und gerechnet.
8. Die App ist eine **installierbare PWA**; das Erfassen und Ändern von Buchungen funktioniert
   **offline** und wird beim nächsten Netz nachgespielt.
9. **Anmeldung nur mit E-Mail + Passwort**; die zweite Person kommt über einen **Einladungslink** dazu.
10. Der Bestand aus `Haushalt.xlsx` wird **einmalig per CLI-Skript** übernommen — kein UI-Feature.

### 1.2 Gesperrte Entscheidungen — NICHT neu entwerfen

Diese acht Punkte sind vom Nutzer entschieden. Ein Implementierungs-Agent, der eine davon
„verbessert", baut das falsche Produkt.

**1 — Genau zwei Personen, vier feste Arten, keine Split-Engine.**
Ein Haushalt hat **exakt zwei Plätze**, durchgesetzt in der DB über `household_members.member_slot`
(1 oder 2) mit `unique(household_id, member_slot)` und `check(member_slot in (1,2))`. Es gibt keine
Rollen, keine Anteilsprozente, keine `shares`-Tabelle, keinen N-Personen-Algorithmus. Gespeichert wird
**symmetrisch**: `payer_id` + `split_mode ∈ {SPLIT_EQUAL, OTHER_ONLY, SETTLEMENT}`. Die vier UI-Arten
`MINE_SPLIT` / `THEIRS_SPLIT` / `FOR_THEM` / `TRANSFER` sind eine **Projektion auf den Betrachter**,
berechnet beim Rendern, niemals gespeichert. Dieselbe Zeile liest sich aus dem anderen Login
automatisch gespiegelt. Ein fünfter Knopf (`THEIRS_FOR_ME`) wird **nicht** gebaut, ist aber ohne
Schemaänderung nachrüstbar.

**2 — Kategorien + freie Tags.**
21 Default-Kategorien (deutsche Labels aus dem Katalog, stabile `slug`s im Code) werden pro Haushalt
beim Anlegen geseedet. `fixkosten` ist systemeigen: nicht löschbar, nicht umbenennbar, weil der Plan
hineinschreibt. Tags sind normalisierte Zeilen (`tags` + `transaction_tags`), keine JSON-Spalte.

**3 — Fixkostenplan mit einkommensproportionaler Monatsbuchung.**
`share(nonPayer, p) = round(income(nonPayer,p) × costTotal(p) / incomeTotal(p))`, halb-weg-von-Null,
**genau eine Rundung**; der Anteil des Zahlers ist per Definition das Komplement, also trägt er jeden
Restcent. Gebucht wird nur der Anteil der **anderen** Person, als `OTHER_ONLY`. Gebuchte Perioden sind
**unveränderlich**; Korrekturen sind zusätzliche Anpassungsbuchungen. Idempotenz über
`unique(household_id, external_key)`.

**4 — Auth: nur E-Mail + Passwort.**
`Bun.password` argon2id, opake Session-IDs als Primärschlüssel der `sessions`-Tabelle, Cookie
`toon_session` (`HttpOnly; SameSite=Lax; Secure(prod); Path=/`, 30 Tage sliding). Kein OAuth, kein
`arctic`, kein Google/GitHub, keine `oauth_accounts`, keine E-Mail-Bestätigung. Passwort-Reset über
gehashten Single-Use-Token. Die zweite Person tritt über einen Einladungstoken bei; ein dritter Beitritt
scheitert mit `household_full`.

**5 — i18n de/en über die handgeschriebene, typgeprüfte Katalog-Schicht.**
`packages/shared/src/i18n` (Runtime + Server-Kataloge) und `apps/web/src/lib/i18n` (React-Binding +
UI-Kataloge). `de` ist Quellkatalog (`satisfies NamespaceCatalog<"…">`), `en` ist
`LocaleCatalog<typeof de>` — ein fehlender, überzähliger oder formfremder Key ist ein **Compile**-Fehler.
Kein `i18n:check`-Skript; `bun run typecheck` ist das Gate.

**6 — PWA + Offline-Erfassung.**
Vier Bausteine gemeinsam, nie einzeln: `setMutationDefaults` (nicht inline), `networkMode:
"offlineFirst"` auf Mutation **und** Ledger-Query, `shouldPersistMutation` nur für **pausierte**
Mutationen einer Allow-List, und eine **beim Aufruf** gemünzte `mutationId`, die serverseitig per
`INSERT … ON CONFLICT DO NOTHING` in `mutation_claims` eingelöst wird. Doppelbuchung beim Replay ist
hier ein falscher Saldo, nicht eine falsche Einkaufsliste.

**7 — Docker single-origin + Caddy.**
EIN Container; die API serviert die gebaute PWA über `WEB_DIST_DIR` (`middleware/staticWeb.ts`, als
LETZTER Mount). `PUBLIC_API_URL=""` im Image → relative URLs → **kein CORS-Eintrag**, kein zweiter
Webserver, kein Hostname im Bundle. Caddy davor terminiert nur TLS (die PWA braucht einen Secure
Context).

**8 — Stack wie toon-recipe.**
Bun-Workspaces-Monorepo (`apps/*`, `packages/*`), Bun.serve + Hono, libSQL über `@libsql/client` +
`drizzle-orm/libsql`, React 19 + Vite + TanStack Router (code-based) + TanStack Query + Tailwind v4,
TypeScript 7 strict, kein `baseUrl`, kein `any` in exportierten Signaturen. Versionen wörtlich aus
`docs/reference-architecture.md` §1.2–1.5, abzüglich `arctic`, `sharp`, `unpdf`.

### 1.3 Was ausdrücklich NICHT gebaut wird

OCR · Beleg-Foto · PDF-Import · URL-Import · Import-Drafts als Entität · Uploads/Thumbnails/GC ·
OAuth · E-Mail-Bestätigung · Resend-Mailer · N-Personen-Gruppen mit Rollen · Bank-Anbindung ·
CSV-Bank-Import · Volltextsuche mit gefalteten Spalten · Merge-Algebra · `scripts/i18n-check.ts`.
Begründungen: `docs/reference-architecture.md` §10.

---

## 2. Datenbankschema

Vollständig in `apps/api/src/db/schema.ts`. Konventionen (Datei-Header, wörtlich zu übernehmen):

```
- ids: crypto.randomUUID() text primary keys
- timestamps: integer unix MILLISECONDS (exposed as ISO strings by the API)
- money: integer CENTS, signed. never real(), never float. `real` here would be a bug.
- periods: text 'YYYY-MM', CHECK-constrained by GLOB
- booleans: integer 0/1 via mode: "boolean"
- every FK used for listing has an index; household-scoped tables cascade from `households`
- a user row is never cascade-deleted through the ledger: payer_id is RESTRICT
```

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = () => Date.now();
const PERIOD_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]";
```

### 2.1 `users` — ein Konto, unabhängig vom Haushalt

```ts
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(), // lower(trim(email)); die App schreibt sie
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    locale: text("locale", { enum: ["de", "en"] }).notNull().default("de"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("users_email_normalized_uidx").on(t.emailNormalized)],
);
```

`users_email_normalized_uidx` ist die **Fachregel** „eine Adresse, ein Konto" — durchgesetzt von der DB,
nicht von einem read-modify-write, den zwei parallele Registrierungen verschränken könnten. `email`
bleibt in der Schreibweise des Nutzers erhalten (Anzeige), `email_normalized` ist die Vergleichsachse;
sie ist `.notNull()` **ohne** Drizzle-Default, damit `tsc` an jeder Insert-Stelle scheitert, die sie
vergisst (Muster aus `reference-architecture.md` §3.1). `passwordHash` ist `notNull` — ohne OAuth gibt
es kein Konto ohne Passwort.

### 2.2 `sessions` — opake Session-IDs, der Cookie-Wert IST der Primärschlüssel

```ts
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    lastUsedAt: integer("last_used_at").notNull().$defaultFn(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);
```

`sessions_user_id_idx`: „alle Sitzungen dieses Kontos" (Sitzungsliste, Logout-überall,
Passwort-Reset löscht alle). `sessions_expires_at_idx`: der opportunistische Sweep löscht per Range —
ohne Index ein Full Scan bei jedem fünften Request. `lastUsedAt` wird höchstens alle 60 s geschrieben.

### 2.3 `households` — der Container, an dem alles hängt

```ts
export const households = sqliteTable(
  "households",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    defaultLocale: text("default_locale", { enum: ["de", "en"] }).notNull().default("de"),
    createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
);
```

Kein Index: es gibt pro Installation eine Handvoll Zeilen, und jeder Zugriff läuft über den
Primärschlüssel oder über `household_members`. `defaultLocale` ist die Sprache, in der der **Server**
Text in Zeilen schreibt (Fixkosten-Beschreibungen) — nie `requestLocale(c)`, sonst schreibt eine
englische UI dauerhaft englische Sätze in einen deutschen Datensatz.

### 2.4 `household_members` — die zwei Plätze, als DB-Fakt

```ts
export const householdMembers = sqliteTable(
  "household_members",
  {
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    memberSlot: integer("member_slot").notNull(),      // 1 oder 2 — 1 ist die Saldo-Perspektive
    displayName: text("display_name").notNull(),        // "Alex", "Robin" — im Haushalt sichtbarer Name
    joinedAt: integer("joined_at").notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    uniqueIndex("household_members_slot_uidx").on(t.householdId, t.memberSlot),
    index("household_members_user_idx").on(t.userId),
    check("household_members_slot_range", sql`${t.memberSlot} in (1, 2)`),
  ],
);
```

**Das ist die Durchsetzung von „genau zwei Personen".** `check(1,2)` + `unique(household_id,
member_slot)` heißt: ein dritter Beitritt hat keinen freien Slot und schlägt in der DB fehl, nicht erst
in einem Service, den jemand später umgeht. `acceptInvite` liest den freien Slot **innerhalb** der
Transaktion und antwortet `409 household_full`, wenn keiner frei ist; ein bereits beigetretener Nutzer
bleibt idempotent erfolgreich.

**Slot 1 ist der Anker der Saldo-Vorzeichen-Konvention** (`balanceCents > 0` heißt „Slot 2 schuldet
Slot 1"). Das ist eine Datenachse, keine Betrachterachse — die API liefert immer den Saldo aus Sicht
von Slot 1 **plus** `perspectiveUserId`, und die Web-App negiert für den Betrachter aus Slot 2.
`onDelete: "restrict"` auf `userId`: ein Konto zu löschen, das im Ledger steht, darf nicht gehen.

### 2.5 `invites` — der Token IST die Capability

```ts
export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    token: text("token").notNull(),                     // Rohwert, 32 Bytes base64url
    email: text("email"),                               // informativ, NICHT erzwungen
    invitedBy: text("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] }).notNull().default("pending"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    acceptedAt: integer("accepted_at"),
    acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("invites_token_uidx").on(t.token),
    index("invites_household_status_idx").on(t.householdId, t.status),
  ],
);
```

`invites_token_uidx` ist der Lookup-Pfad des öffentlichen Vorschau-Endpunkts — ein Full Scan wäre hier
auch ein Timing-Kanal. `invites_household_status_idx` bedient „offene Einladungen dieses Haushalts" auf
dem Haushalt-Screen. **Der Token steht im Klartext**, der Passwort-Reset-Token nur als SHA-256: *eine
geleakte invites-Tabelle kostet eine Haushaltsmitgliedschaft, eine geleakte reset-Tabelle jedes Konto.*
Die eingeladene E-Mail wird bewusst nicht erzwungen, sonst kann man einen Link nicht weiterleiten.

### 2.6 `categories` — stabile `slug`s, Label aus dem Katalog

```ts
export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),                       // "tiere", "fixkosten", … oder "custom-<uuid8>"
    customLabel: text("custom_label"),                  // null = Label kommt aus dem i18n-Katalog
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("categories_household_slug_uidx").on(t.householdId, t.slug),
    index("categories_household_position_idx").on(t.householdId, t.position),
  ],
);
```

`slug` ist der **code-seitige** Schlüssel (`fixkosten` wird vom Plan gesucht, `sonstiges` ist der
Fallback des Importers); `id` bleibt eine UUID, damit `transactions.category_id` ein normaler FK ist.
`categories_household_slug_uidx` verhindert zwei `fixkosten`-Zeilen in einem Haushalt — das wäre ein
Plan, der in zwei verschiedene Töpfe bucht. `categories_household_position_idx` ist die Sortierung des
Kategorie-Screens und des Pickers im Erfassen-Flow. Ein Default-Label ist `customLabel = null` und wird
**bei jedem Lesen** aus dem Katalog gerendert; ein umbenanntes ist gespeicherter Inhalt und wird nie neu
übersetzt. `isSystem` gilt nur für `fixkosten`.

### 2.7 `tags` und `transaction_tags` — normalisiert, mit Autocomplete-Achse

```ts
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),                       // Anzeige, Schreibweise des Nutzers
    nameKey: text("name_key").notNull(),                // normalizeTagName(name) = lower(trim(collapse ws))
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("tags_household_name_key_uidx").on(t.householdId, t.nameKey),
    index("tags_household_usage_idx").on(t.householdId, t.usageCount),
  ],
);

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transactionId: text("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.tagId] }),
    index("transaction_tags_tag_idx").on(t.tagId),
  ],
);
```

`tags_household_name_key_uidx` macht aus `Amazon`, `amazon` und ` Amazon ` einen Tag — die Fachregel als
Index, wie `shopping_list_items(list_id, merge_key)` im Referenz-Repo. `tags_household_usage_idx`
sortiert die Autocomplete-Liste nach Häufigkeit (der Erfassen-Flow zeigt die Top-8 ohne Tippen).
`usage_count` wird beim Verknüpfen/Lösen fortgeschrieben, nicht bei jedem Lesen gezählt.
Der zusammengesetzte Primärschlüssel ist die Idempotenz von „Tag anhängen"; `transaction_tags_tag_idx`
bedient die Rückrichtung (Filter „alle Buchungen mit Tag X" und die Zählung vor dem Löschen eines Tags).

### 2.8 `transactions` — das Kassenbuch

```ts
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    payerId: text("payer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    splitMode: text("split_mode", { enum: ["SPLIT_EQUAL", "OTHER_ONLY", "SETTLEMENT"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),     // signed, NIE 0
    description: text("description").notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    bookedAt: integer("booked_at").notNull(),           // unix ms, 00:00 Europe/Berlin bei Tagesgenauigkeit
    dateSource: text("date_source", { enum: ["exact", "day", "month", "estimated"] }).notNull(),
    origin: text("origin", { enum: ["manual", "fixed_plan", "fixed_plan_adjustment", "import"] }).notNull(),
    planPeriod: text("plan_period"),                    // 'YYYY-MM' bei origin fixed_plan*, sonst null
    categorySource: text("category_source", { enum: ["manual", "heuristic", "system"] }).notNull(),
    importSeq: integer("import_seq"),                   // Blattzeile, erhält die Reihenfolge des Imports
    externalKey: text("external_key"),                  // Idempotenz-Schlüssel, null für manuelle Zeilen
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("transactions_household_external_key_uidx").on(t.householdId, t.externalKey),
    index("transactions_household_booked_idx").on(t.householdId, t.bookedAt, t.importSeq),
    index("transactions_household_category_idx").on(t.householdId, t.categoryId),
    index("transactions_household_plan_idx").on(t.householdId, t.origin, t.planPeriod),
    check("transactions_amount_not_zero", sql`${t.amountCents} <> 0`),
    check("transactions_plan_period_format",
      sql`${t.planPeriod} is null or ${t.planPeriod} glob '${sql.raw(PERIOD_GLOB)}'`),
  ],
);
```

**Wie eine Transaktion ihre Art trägt.** Nur `payerId` + `splitMode`. Es gibt **keine**
`beneficiary_id`-Spalte und es darf keine geben: bei zwei Mitgliedern ist „die andere Person"
eindeutig, und eine zweite Wahrheit wäre nur eine Stelle, an der die beiden auseinanderlaufen können.
Die vier UI-Arten entstehen in `projectKind(tx, viewerId)` aus `@toon/shared`:

| UI-Art | `payerId` | `splitMode` | Wer trägt was |
| --- | --- | --- | --- |
| `MINE_SPLIT` | Betrachter | `SPLIT_EQUAL` | Betrachter Hälfte + Restcent, andere Hälfte |
| `THEIRS_SPLIT` | die andere | `SPLIT_EQUAL` | andere Hälfte + Restcent, Betrachter Hälfte |
| `FOR_THEM` | Betrachter | `OTHER_ONLY` | die andere Person zu 100 % |
| `TRANSFER` | die andere | `SETTLEMENT` | reine Geldbewegung, keine Ausgabe |

**Wie eine automatisch erzeugte Monatsbuchung erkennbar bleibt.** `origin` ist die Herkunftsspalte und
hat **keinen Drizzle-Default** — jede Insert-Stelle muss sie setzen, sonst scheitert `tsc`. Die
Neuberechnung findet ihre Zeilen über `where(householdId, origin = 'fixed_plan', planPeriod = p)`, also
über `transactions_household_plan_idx` und **nie** über ein `LIKE` auf `external_key`. Eine manuelle
Zeile (`origin = 'manual'`) kann von keiner Plan-Operation getroffen werden, weil sie in keiner dieser
`WHERE`-Klauseln vorkommt. Umgekehrt lehnen `PATCH`/`DELETE` auf einer Zeile mit `origin ≠ 'manual'`
mit `409 transaction_generated` ab.

**Indizes, einzeln begründet.**

* `transactions_household_external_key_uidx` — **die** Idempotenz-Garantie. Der Fixkostenplan schreibt
  `fixedplan:{hh}:{YYYY-MM}`, die Korrektur `fixedplan-adj:{hh}:{p}:{bookedCents}`, der Importer
  `xlsx:B:{row}` / `xlsx:E:{row}` / `xlsx:H:{row}` / `xlsx:rent:{YYYY-MM}` / `xlsx:transfers:total`.
  SQLite behandelt jedes `NULL` als verschieden, manuelle Zeilen sind also nicht betroffen. Zwei
  parallele Catch-up-Läufe, ein Neustart mitten in der Schleife, ein wiederholter HTTP-Call: alle
  konvergieren auf genau eine Zeile pro Periode. `plan.lastBookedPeriod` ist ein **Cache für den
  Scan-Start, nicht die Wahrheit** — bei Widerspruch gewinnt der Index.
* `transactions_household_booked_idx` — die Sortierung des Transaktionen-Screens (`bookedAt` absteigend,
  `importSeq` als Tiebreaker, damit die Blattreihenfolge innerhalb eines Datums überlebt), zugleich der
  Range-Filter „Zeitraum" und der Scan-Pfad der Saldo-Berechnung.
* `transactions_household_category_idx` — „Ausgaben nach Kategorie" auf der Übersicht und die Zählung
  vor dem Löschen einer Kategorie (`409 category_in_use`).
* `transactions_household_plan_idx` — die Neuberechnung und der Catch-up finden gebuchte Perioden ohne
  Full Scan; gleichzeitig ist „hat Periode p schon eine Buchung?" eine Index-Frage.
* **Kein Index auf `payerId`** — bewusst. Der Saldo liest ohnehin alle Zeilen des Haushalts, und SQLite
  würde ihn nicht wählen. Der einzige Grund für einen FK-Index wäre ein Cascade-Delete, und `payerId`
  ist `restrict`.

`dateSource` hat vier Werte: `exact` für alles, was die App selbst schreibt (der Nutzer hat ein Datum
gewählt, der Plan bucht den Monatsersten), und `day` / `month` / `estimated` ausschließlich für
importierte Zeilen (`docs/ledger-spec.md` §6.3). Die UI markiert `estimated` mit `~` und
`transactions.dateEstimated`.

### 2.9 `mutation_claims` — Replay-Schutz für die Offline-Warteschlange

```ts
export const mutationClaims = sqliteTable(
  "mutation_claims",
  {
    id: text("id").primaryKey(),                        // die client-gemünzte mutationId
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    appliedAt: integer("applied_at").notNull().$defaultFn(now),
  },
  (t) => [index("mutation_claims_applied_at_idx").on(t.appliedAt)],
);
```

`claimMutation()` ist ein **INSERT auf den Primärschlüssel** mit `onConflictDoNothing().returning()`,
kein SELECT-dann-Write — zwei gleichzeitige Replays derselben Id würden sonst beide „noch nicht
angewendet" lesen. Ein zweiter Aufruf wendet nichts an und gibt den **aktuellen Zustand** der über
`transactionId` verknüpften Zeile zurück (200, nicht 409 — ein Replay ist kein Fehler).
`mutation_claims_applied_at_idx` bedient `pruneMutationClaims()` (TTL 14 Tage) als Range-Delete.
`mutationId` steht **nicht** auf `transactions`: der Anspruch deckt auch Änderungen und Löschungen ab,
die keine neue Zeile erzeugen.

### 2.10 `fixed_cost_items` — temporale Fixkostenpositionen

```ts
export const fixedCostItems = sqliteTable(
  "fixed_cost_items",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    label: text("label").notNull(),                     // "Miete", "Strom" — Nutzerinhalt, nie übersetzt
    amountCents: integer("amount_cents").notNull(),     // > 0
    activeFrom: text("active_from").notNull(),          // 'YYYY-MM', inklusive
    activeTo: text("active_to"),                        // 'YYYY-MM', inklusive; null = offen
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("fixed_cost_items_household_active_idx").on(t.householdId, t.activeFrom, t.activeTo),
    check("fixed_cost_items_amount_positive", sql`${t.amountCents} > 0`),
    check("fixed_cost_items_from_format", sql`${t.activeFrom} glob '${sql.raw(PERIOD_GLOB)}'`),
    check("fixed_cost_items_to_format",
      sql`${t.activeTo} is null or ${t.activeTo} glob '${sql.raw(PERIOD_GLOB)}'`),
    check("fixed_cost_items_range", sql`${t.activeTo} is null or ${t.activeTo} >= ${t.activeFrom}`),
  ],
);
```

`fixed_cost_items_household_active_idx` ist der Kern des Catch-ups: „welche Positionen galten in Periode
p" wird für bis zu fünf verschlafene Monate hintereinander gefragt. Der Range-Check in der DB, weil eine
Position mit `activeTo < activeFrom` still **nie** in eine Berechnung einginge und der Nutzer nur einen
zu kleinen Betrag sähe. **Temporal, in der Praxis append-only:** einen Betrag zu ändern heißt, die alte
Zeile mit `activeTo` zu schließen und eine neue einzufügen — nur so ist jede Periode aus Daten
reproduzierbar. Der Text `'YYYY-MM'` ist als Periode lexikographisch sortierbar, deshalb funktionieren
`>=` / `<=` direkt.

### 2.11 `incomes` — temporale Einkommen je Person

```ts
export const incomes = sqliteTable(
  "incomes",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),     // > 0
    validFrom: text("valid_from").notNull(),            // 'YYYY-MM', inklusive
    validTo: text("valid_to"),                          // 'YYYY-MM', inklusive; null = offen
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("incomes_person_from_uidx").on(t.householdId, t.personId, t.validFrom),
    index("incomes_household_person_idx").on(t.householdId, t.personId, t.validFrom, t.validTo),
    check("incomes_amount_positive", sql`${t.amountCents} > 0`),
    check("incomes_from_format", sql`${t.validFrom} glob '${sql.raw(PERIOD_GLOB)}'`),
    check("incomes_to_format", sql`${t.validTo} is null or ${t.validTo} glob '${sql.raw(PERIOD_GLOB)}'`),
    check("incomes_range", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
  ],
);
```

`incomes_person_from_uidx` ist eine Fachregel: **zwei Gehälter derselben Person ab demselben Monat sind
kein legitimer Zustand**, sondern ein doppelt abgeschickter Speichern-Knopf — und das Ergebnis wäre eine
stillschweigend halbierte Quote. Der zweite Index ist der Lookup „welches Gehalt galt in p" während des
Catch-ups. Überlappungen jenseits des gleichen `validFrom` fängt die DB nicht; das ist Aufgabe des
Services (`plan_incomplete`, siehe §3.7).

### 2.12 `fixed_cost_plans` — eine Zeile pro Haushalt

```ts
export const fixedCostPlans = sqliteTable(
  "fixed_cost_plans",
  {
    householdId: text("household_id").primaryKey().references(() => households.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    payerId: text("payer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    startPeriod: text("start_period").notNull(),        // erste buchbare Periode
    lastBookedPeriod: text("last_booked_period"),       // CACHE für den Scan-Start, nicht die Wahrheit
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    check("fixed_cost_plans_start_format", sql`${t.startPeriod} glob '${sql.raw(PERIOD_GLOB)}'`),
    check("fixed_cost_plans_last_format",
      sql`${t.lastBookedPeriod} is null or ${t.lastBookedPeriod} glob '${sql.raw(PERIOD_GLOB)}'`),
  ],
);
```

Der Haushalt ist der Primärschlüssel — ein Haushalt hat **einen** Plan, nicht mehrere. `enabled`
startet auf `false`: ein frisch angelegter Haushalt hat weder Positionen noch Gehälter, und ein Plan,
der beim ersten Boot `0,00 €` bucht, wäre ein Fehler mit Datumsstempel. Kein Index: eine Zeile pro
Haushalt, Zugriff immer über den Primärschlüssel.

### 2.13 `accrual_runs` — Audit-Protokoll der Monatsläufe, NICHT die Idempotenz

```ts
export const accrualRuns = sqliteTable(
  "accrual_runs",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["boot", "interval", "manual", "import"] }).notNull(),
    fromPeriod: text("from_period"),
    toPeriod: text("to_period"),
    periodsBooked: integer("periods_booked").notNull(),
    periodsSkipped: integer("periods_skipped").notNull(),
    bookedCents: integer("booked_cents").notNull(),
    error: text("error"),                               // englischer Ops-Text, null bei Erfolg
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at").notNull(),
  },
  (t) => [index("accrual_runs_household_started_idx").on(t.householdId, t.startedAt)],
);
```

**Diese Tabelle wird nie gelesen, um zu entscheiden, ob gebucht wird.** Die Idempotenz liegt
ausschließlich auf `transactions_household_external_key_uidx` (§2.8). `accrual_runs` beantwortet die
Ops-Frage „warum ist im April nichts gebucht worden" und speist die Zeile „Letzter Lauf: …" auf dem
Fixkosten-Screen. Ein Lauf schreibt seine Zeile auch dann, wenn er nichts gebucht hat (`periodsBooked
= 0`), und auch dann, wenn er scheitert (`error` gesetzt) — ein Protokoll mit Lücken ist wertlos.
`accrual_runs_household_started_idx` liefert „die letzten N Läufe" absteigend.

### 2.14 `password_reset_tokens` — gehasht, Single-Use

```ts
export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),            // SHA-256 des gemailten Rohtokens
    expiresAt: integer("expires_at").notNull(),         // TTL 1 Stunde
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_uidx").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);
```

`password_reset_tokens_hash_uidx` ist der einzige Lookup-Pfad (Rohtoken hashen, Zeile suchen).
`password_reset_tokens_user_idx`: eine neue Anforderung entwertet die ausstehende, das ist ein Delete
per `userId`. Unbekannt, abgelaufen und schon benutzt antworten identisch `400 reset_token_invalid`.
Ein erfolgreicher Reset **löscht jede Session dieses Nutzers** — ein gestohlener Cookie darf einen
Reset nicht überleben.

### 2.15 `email_verification_tokens` — wird NICHT angelegt

In `toon-recipe` existierte diese Tabelle einzig, um OAuth-Auto-Linking eines Tages absichern zu können
(`email_verified_at` als einziges Beweisstück). Ohne OAuth gibt es hier nichts, was diesen Zeitstempel
als Beweis braucht: Registrierung erzeugt ein Konto, ein Einladungstoken erzeugt eine Mitgliedschaft,
und keine der beiden Entscheidungen hängt daran, ob jemand seine Adresse bestätigt hat. Die Tabelle,
die Endpunkte `/api/auth/email/verify/*`, `users.email_verified`, `users.email_verified_at` und die
`EmailVerificationCard` entfallen ersatzlos. **Nicht „für später" anlegen** — eine leere Tabelle mit
Endpunkten davor ist Angriffsfläche ohne Nutzen.

### 2.16 Row-Typen, Relationen, PRAGMAs

Am Dateiende alle Row-Typen exportieren, `SessionRow` / `NewSessionRow`-Muster für jede Tabelle, danach
die `relations(...)`-Blöcke gebündelt.

`apps/api/src/db/client.ts`:

```ts
const LOCAL_FILE_PRAGMAS: readonly string[] = [
  "journal_mode = WAL",       // Leser blockieren Schreiber nicht; persistent in der Datei
  "synchronous = FULL",       // siehe Kommentar unten — NICHT auf NORMAL setzen
  "busy_timeout = 5000",      // Default 0 heißt SQLITE_BUSY sofort
  "cache_size = -65536",      // 64 MB Page-Cache
  "mmap_size = 268435456",    // 256 MB
];
```

Der begleitende Kommentar, wörtlich zu übernehmen:

> `synchronous = FULL`, not `NORMAL`. toon-recipe uses `NORMAL` and says why: *"can lose the last
> transactions to a power cut, never to a process crash — the right trade for a recipe box, not for a
> ledger."* This IS the ledger. Two people settle real money against the balance this file holds; the
> last committed settlement disappearing after a power cut is not an acceptable failure mode. The price
> is real and measured in the reference repo — about 5 ms per write instead of 0.04 ms — and a
> household cash book does a few dozen writes a day, not a few thousand per second.

`journal_mode` ist persistent in der Datei, `synchronous` **pro Connection** — deshalb steht beides in
`createDatabase()` und nicht in einer Migration. Für `:memory:` und für remote `libsql://` wird nichts
gesendet. Ein abgelehntes PRAGMA warnt und legt den Server nicht lahm.

`withTransaction` / `DbLike` / `transactionsSupported` werden unverändert aus
`reference-architecture.md` §3.5 übernommen. **`TEST_DATABASE_URL` zeigt in der CI und lokal auf eine
temporäre Datei**, nicht auf `file::memory:` — libSQL 0.17.4 verwirft eine Memory-DB beim
Transaktions-Commit, und ein Ledger, dessen Integrationstests nie eine echte Transaktion sehen, testet
seine wichtigste Eigenschaft nicht.

---

## 3. API-Vertrag

Basis-URL: `PUBLIC_API_URL` (im Docker-Image bewusst `""` → relative URLs). Alles unter `/api` ist JSON.
Jeder Request-/Response-Schemaname ist aus `@toon/shared` exportiert
(`packages/shared/src/schemas/*.ts`). **Keine Form erfinden — das Shared-Paket additiv erweitern.**

### 3.1 Konventionen

* **Content-Type**: immer `application/json`. Es gibt keinen Multipart-Endpunkt.
* **Fehler**: immer `{ error: { code, message, details? } }`. `code` kommt aus `ERROR_CODES` und ist
  ein **stabiler Wire-Contract** — nie umbenannt, nie lokalisiert. `message` ist Prosa in der
  verhandelten Locale, also **auf `code` branchen, nie auf `message`**. Nie ein Stacktrace.
* **Locale**: aus `Accept-Language` verhandelt (`de`, `en`, Fallback `DEFAULT_LOCALE = de`).
  `Accept-Language` ist CORS-safelisted, kostet also keinen Preflight. Ein `validation_failed`-Detail
  trägt zusätzlich `i18n: { key, values }`, damit der Client in **seiner** aktiven Locale nachrendern
  kann; ist der Key unbekannt (Versionsversatz), fällt er auf `message` zurück — **nie** auf den rohen
  Dotted-Key.
* **Auth**: opake Session-Id im Cookie `toon_session` (`HttpOnly; SameSite=Lax; Secure(prod); Path=/`),
  30 Tage sliding. Browser senden `credentials: "include"`.
* **Auth-Level**:

  | Level | Bedeutung |
  | --- | --- |
  | `public` | keine Session nötig |
  | `session` | gültige Session (sonst 401) |
  | `household` | Session **und** Mitgliedschaft in `:householdId` (sonst 404 bzw. 403) |

* **Haushalts-Middleware**: `requireHousehold()` in `apps/api/src/middleware/household.ts`, als
  Router-Middleware angewandt (`router.use("*", requireSession()); router.use("*", requireHousehold())`).
  **Niemals inline in einem Handler prüfen.** Semantik, wörtlich in den Datei-Header:

  ```
  no session              -> 401 unauthorized
  unknown household       -> 404 not_found      (verrät nie, dass er existiert)
  not a member            -> 403 forbidden
  ok                      -> c.set("household", { householdId, userId, memberSlot })
  ```

  Der Unterschied „gibt es nicht" vs. „gehört dir nicht" wird in **einer** Query per LEFT JOIN
  entschieden (Muster aus `reference-architecture.md` §2.6).
* **Ids**: `crypto.randomUUID()`. **Zeitstempel**: ISO-8601 auf der Leitung, integer unix ms in SQLite
  (`toIso()`).
* **Geld**: auf der Leitung **immer `…Cents` als integer**, nie ein Dezimalstring, nie ein Float.
  Formatierung passiert ausschließlich im Client am Rand des Render-Baums.
* **Perioden**: `'YYYY-MM'`-Strings.
* **Listen**: `{ items, total, limit, offset }` (`listResponse(...)`), `limit` Default 50, Max 200.
  (Höher als toon-recipes 24/100: eine Transaktionsliste ist eine dichte Zeilendarstellung, kein
  Kartenraster, und ein Monat hat gut 60 Zeilen.)
* **Status-Codes**: `200` Lesen/Ändern, `201` Anlegen, `204` Löschen/kein Body, `400` Bad Request,
  `401` unauthorized, `403` forbidden, `404` not found, `409` Konflikt, `422` Validierung,
  `429` Rate-Limit, `500` intern.
* **Idempotenz**: jeder schreibende Ledger-Endpunkt akzeptiert ein optionales `mutationId` (UUID) im
  Body. Ist es bekannt, wird **nichts** angewendet und der **aktuelle** Zustand mit `200` zurückgegeben
  (nicht `201`, nicht `409`). Fehlt es, gibt es keinen Replay-Schutz — das ist für Aufrufe erlaubt, die
  ohnehin idempotent sind.

### 3.2 `ERROR_CODES` — vollständig

`packages/shared/src/schemas/common.ts`:

```ts
export const ERROR_CODES = [
  // generisch (Form aus toon-recipe, unverändert)
  "bad_request",
  "validation_failed",
  "unauthorized",
  "invalid_credentials",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
  // Auth
  "email_taken",
  "reset_token_invalid",
  "password_required",
  // Haushalt und Einladung
  "invite_invalid",
  "invite_expired",
  "household_full",
  "household_required",
  "member_has_ledger",
  // Ledger
  "transaction_amount_zero",
  "transaction_generated",
  "balance_stale",
  "settlement_amount_invalid",
  // Kategorien und Tags
  "category_in_use",
  "category_system",
  "category_slug_taken",
  "tag_name_taken",
  // Fixkostenplan
  "plan_disabled",
  "plan_incomplete",
  "plan_period_locked",
  "plan_period_out_of_range",
  // nur clientseitig gemünzt, nie vom Server gesendet
  "network_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
```

Bedeutung der nicht selbsterklärenden Codes:

| Code | Status | Wann |
| --- | --- | --- |
| `password_required` | 422 | `POST /api/auth/password` ohne `currentPassword` |
| `invite_invalid` | 404 | Token unbekannt, widerrufen oder schon eingelöst |
| `invite_expired` | 409 | Token abgelaufen; die Zeile wird dabei auf `status: "expired"` gesetzt |
| `household_full` | 409 | beide `member_slot` belegt |
| `household_required` | 409 | der Nutzer hat noch keinen Haushalt (Bootstrap-Zustand) |
| `member_has_ledger` | 409 | Austritt/Entfernen, während Buchungen dieser Person existieren |
| `transaction_amount_zero` | 422 | `amountCents === 0`; negative Beträge sind **erlaubt** |
| `transaction_generated` | 409 | `PATCH`/`DELETE` auf `origin ≠ 'manual'` |
| `balance_stale` | 409 | `expectedBalanceCents` passt nicht mehr; Body trägt `details.currentBalanceCents` |
| `settlement_amount_invalid` | 422 | `amountCents <= 0` bei `POST /settlements` |
| `category_in_use` | 409 | Löschen einer Kategorie, an der Buchungen hängen |
| `category_system` | 409 | Löschen/Umbenennen von `fixkosten` |
| `plan_disabled` | 409 | `run`/`recalculate` bei `enabled = false` |
| `plan_incomplete` | 409 | keine aktive Position, kein Gehalt für eine Person, oder überlappende Gehaltszeilen |
| `plan_period_locked` | 409 | `PATCH …/plan { startPeriod }` auf oder vor eine bereits mit EINER Transaktion belegte Periode (egal welchen `origin`s — typischerweise die importierte Mietserie, ledger-spec.md §4.7) |
| `plan_period_out_of_range` | 422 | Periode vor `startPeriod` oder in der Zukunft |

### 3.3 Health

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | public | – | `HealthResponse` | 200 |

```ts
HealthResponse = {
  status: "ok"; version: string; time: string;      // ISO
  database: "file" | "remote";
  mail: "console" | "smtp";                          // welcher Transport konfiguriert ist
}
```

Kein `features`-Objekt: es gibt keinen optionalen Server-Teil, den die UI verstecken müsste. Ob eine
Einladungsmail wirklich rausging, beantwortet `mailDelivery` an genau der Stelle, an der es zählt
(§3.5), nicht ein globales Flag.

### 3.4 Auth — `apps/api/src/routes/auth.ts`

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | public | `RegisterRequest` | `AuthSessionResponse` | 201, 409 `email_taken`, 422, 429 |
| POST | `/api/auth/login` | public | `LoginRequest` | `AuthSessionResponse` | 200, 401 `invalid_credentials`, 422, 429 |
| POST | `/api/auth/logout` | session | – | – | 204, 401 |
| GET | `/api/auth/me` | session | – | `MeResponse` | 200, 401 |
| PATCH | `/api/auth/me` | session | `UpdateProfileRequest` | `UserResponse` | 200, 401, 422 |
| POST | `/api/auth/password` | session | `ChangePasswordRequest` | – | 204, 401 `invalid_credentials`, 422 `password_required` |
| POST | `/api/auth/password/forgot` | public | `ForgotPasswordRequest` | – | **immer 204**, 422, 429 |
| POST | `/api/auth/password/reset` | public | `ResetPasswordRequest` | – | 204, 400 `reset_token_invalid`, 422, 429 |
| GET | `/api/auth/sessions` | session | – | `SessionListResponse` | 200, 401 |
| DELETE | `/api/auth/sessions/:handle` | session | – | – | 204, 401, 404 |

```ts
RegisterRequest      = { email: string; name: string; password: PasswordSchema; inviteToken?: string }
LoginRequest         = { email: string; password: string }
UpdateProfileRequest = { name?: string; locale?: "de" | "en" }
ChangePasswordRequest= { currentPassword: string; newPassword: PasswordSchema }
ForgotPasswordRequest= { email: string }
ResetPasswordRequest = { token: string; password: PasswordSchema }

UserResponse         = { id, email, name, locale, createdAt }
MeResponse           = { user: UserResponse; households: HouseholdSummary[]; activeHouseholdId: string | null }
AuthSessionResponse  = { user: UserResponse; household: HouseholdSummary | null }
SessionListResponse  = { items: { handle, current, createdAt, lastUsedAt, expiresAt, ipAddress, userAgent }[] }
HouseholdSummary     = { id, name, memberSlot: 1 | 2, memberCount: 1 | 2 }
```

Anmerkungen

* **Ohne `inviteToken` legt `register` einen Haushalt an** (`name` aus dem Katalogschlüssel
  `settings.household.defaultName` in `env.defaultLocale` gerendert: `"Unser Haushalt"`), setzt den
  Nutzer auf `member_slot: 1` und seedet die 21 Kategorien plus die `fixed_cost_plans`-Zeile
  (`enabled: false`, `payerId` = der Nutzer, `startPeriod` = aktuelle Periode).
* **Mit `inviteToken` wird der Token VOR dem User-Insert validiert** (`loadRedeemableInvite`), damit ein
  kaputter Token keinen Nutzer ohne Haushalt hinterlässt. Der Beitritt belegt den freien `member_slot`.
* `verifyPassword` läuft **immer**, auch für unbekannte Adressen, gegen einen echten Dummy-Hash — die
  Antwortzeit ist damit konstant und `/login` kein Enumerations-Orakel.
* Rate-Limits (in-memory, unter `NODE_ENV=test` deaktiviert): `login:<ip>|<email>` 10/min **plus**
  IP-unabhängig `login-email:<email>` 20/15 min; `register:<ip>` 5/15 min;
  `password-forgot:<ip>` 5/15 min plus `password-forgot-email:<email>` 3/15 min;
  `password-reset:<ip>` 10/15 min. `clientIp()` glaubt `X-Forwarded-For` nur bei `TRUST_PROXY=1`.
* `/password/forgot` antwortet **204 für bekannte und unbekannte Adressen**, mit identischem Body und
  identischem Timing; das Rate-Limit greift **vor** dem Lookup. Ein fehlgeschlagener Mailversand wird
  geloggt und ändert die Antwort nicht.
* `/password/reset` verbraucht den Token einmal, setzt den Hash und **löscht jede Session des Nutzers**.
  Es meldet den Nutzer **nicht** an; die Web-App schickt ihn auf `/login?reset=1`.
* `GET /api/auth/sessions` gibt nur `sessionHandle(id)` heraus, **nie die Id** — hono's `logger()`
  schreibt `c.req.path`, ein 30-Tage-Token stünde sonst im Access-Log und wäre als Cookie
  wiederverwendbar. `DELETE` nimmt denselben Handle.
* `PATCH /api/auth/me` sendet `locale` als **aufgelöste** Locale, nie `null`; die Spalte existiert nur,
  damit Mail eine Sprache wählen kann.

### 3.5 Haushalte — `apps/api/src/routes/households.ts`

Gemountet auf `/api/households`. **Die beiden `/invites/…`-Routen VOR `/:householdId` registrieren**,
sonst frisst der Parameter sie.

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/households` | session | – | `HouseholdListResponse` | 200, 401 |
| POST | `/api/households` | session | `CreateHouseholdRequest` | `HouseholdResponse` | 201, 401, 422 |
| GET | `/api/households/invites/:token` | public | – | `InvitePreviewResponse` | 200, 404 `invite_invalid`, 409 `invite_expired` |
| POST | `/api/households/invites/accept` | session | `AcceptInviteRequest` | `AcceptInviteResponse` | 200, 401, 404 `invite_invalid`, 409 `invite_expired`, 409 `household_full` |
| GET | `/api/households/:householdId` | household | – | `HouseholdDetailResponse` | 200, 401, 403, 404 |
| PATCH | `/api/households/:householdId` | household | `UpdateHouseholdRequest` | `HouseholdResponse` | 200, 403, 404, 422 |
| GET | `/api/households/:householdId/members` | household | – | `MemberListResponse` | 200, 403, 404 |
| PATCH | `/api/households/:householdId/members/:userId` | household (nur man selbst) | `UpdateMemberRequest` | `MemberResponse` | 200, 403, 404, 422 |
| DELETE | `/api/households/:householdId/members/:userId` | household (nur man selbst) | – | – | 204, 403, 404, 409 `member_has_ledger` |
| GET | `/api/households/:householdId/invites` | household | – | `InviteListResponse` | 200, 403, 404 |
| POST | `/api/households/:householdId/invites` | household | `CreateInviteRequest` | `InviteResponse` | 201, 403, 404, 409 `household_full`, 422 |
| DELETE | `/api/households/:householdId/invites/:inviteId` | household | – | – | 204, 403, 404 |

```ts
CreateHouseholdRequest = { name: string; displayName?: string }
UpdateHouseholdRequest = { name?: string; defaultLocale?: "de" | "en" }
UpdateMemberRequest    = { displayName: string }
CreateInviteRequest    = { email?: string }
AcceptInviteRequest    = { token: string; displayName?: string }

MemberResponse         = { userId, displayName, memberSlot: 1 | 2, name, email, joinedAt }
MemberListResponse     = { items: MemberResponse[] }
HouseholdResponse      = { id, name, defaultLocale, memberCount, createdAt, updatedAt }
HouseholdDetailResponse= { household: HouseholdResponse; members: MemberResponse[]; viewerSlot: 1 | 2 }
InvitePreviewResponse  = { householdName: string; invitedByName: string; expiresAt: string }
InviteResponse         = { id, token, inviteUrl, email, status, expiresAt, createdAt,
                           mailDelivery: "sent" | "not_configured" | "failed" }
AcceptInviteResponse   = { household: HouseholdResponse; memberSlot: 1 | 2; alreadyMember: boolean }
```

Anmerkungen

* **Ein Haushalt hat genau zwei Plätze.** `POST /invites` antwortet `409 household_full`, wenn beide
  Slots belegt sind — die Einladung gar nicht erst auszustellen ist ehrlicher, als sie beim Einlösen
  scheitern zu lassen. Ein Haushalt hat **höchstens eine offene Einladung**; eine zweite widerruft die
  erste (kein eigener Fehlercode, das ist der erwartete „nochmal senden"-Pfad).
* `acceptInvite` ist **idempotent**: wer schon Mitglied ist, bekommt `alreadyMember: true` und seinen
  bestehenden Slot; niemand wird herabgestuft. Der Token ist die Capability; die eingeladene E-Mail wird
  **nicht** erzwungen, damit ein Link weitergeleitet werden kann.
* Token: 32 Byte URL-safe, 14 Tage TTL, `inviteUrl = ${WEB_ORIGIN}/invite/<token>`.
* `mailDelivery` hat drei Zustände, und die UI darf `not_configured` / `failed` **nie** als Erfolg
  rendern. Die Einladung ist in allen drei Fällen gültig — `inviteUrl` ist die Wahrheit —, aber ein
  konfigurierter Transport, der die Mail verweigert, ist ein kaputtes Deployment, keine Selfhost-Wahl
  ohne Mailserver. Der Versand passiert **nach** dem Commit und lässt die Aktion nie scheitern.
* `DELETE /members/:userId` ist der Austritt. Er ist nur für einen selbst erlaubt (bei zwei Personen ist
  „den anderen rauswerfen" keine Funktion, sondern ein Streit) und scheitert mit `member_has_ledger`,
  solange Buchungen mit dieser `payer_id` existieren — der Saldo hinge sonst an einem Geist.
* `POST /api/households` existiert für den seltenen Fall, dass jemand seinen Haushalt gelöscht hat oder
  über eine Einladung registriert wurde und später einen eigenen braucht. Es gibt **keinen**
  Haushalts-Umschalter in der UI; `MeResponse.activeHouseholdId` ist der erste (und praktisch einzige)
  Eintrag.

### 3.6 Transaktionen — `apps/api/src/routes/transactions.ts`

Gemountet auf `/api/households/:householdId/transactions`.

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `…/transactions` | household | `TransactionListQuery` (query) | `TransactionListResponse` | 200, 403, 404, 422 |
| POST | `…/transactions` | household | `CreateTransactionRequest` | `TransactionResponse` | 201 (200 bei Replay), 403, 404, 422 |
| GET | `…/transactions/summary` | household | `TransactionSummaryQuery` (query) | `TransactionSummaryResponse` | 200, 403, 404, 422 |
| GET | `…/transactions/:transactionId` | household | – | `TransactionResponse` | 200, 403, 404 |
| PATCH | `…/transactions/:transactionId` | household | `UpdateTransactionRequest` | `TransactionResponse` | 200, 403, 404, 409 `transaction_generated`, 422 |
| DELETE | `…/transactions/:transactionId` | household | `?mutationId=` | – | 204, 403, 404, 409 `transaction_generated` |

**`/summary` VOR `/:transactionId` registrieren.**

```ts
TransactionListQuery = {
  from?: string;            // ISO-Datum oder 'YYYY-MM'
  to?: string;
  kind?: "MINE_SPLIT" | "THEIRS_SPLIT" | "FOR_THEM" | "TRANSFER";   // Projektion, s.u.
  splitMode?: "SPLIT_EQUAL" | "OTHER_ONLY" | "SETTLEMENT";
  payerId?: string;
  categoryId?: string;
  tagIds?: string;          // kommasepariert; eine Buchung muss ALLE tragen
  origin?: "manual" | "fixed_plan" | "fixed_plan_adjustment" | "import";
  q?: string;               // LIKE auf description, case-insensitiv, kein FTS
  includeAggregates?: boolean;  // Default true; false blendet tags='sammelbuchung' aus
  sort?: "bookedAt" | "-bookedAt" | "amount" | "-amount";  // Default "-bookedAt"
  limit?: number; offset?: number;
}

TransactionResponse = {
  id, householdId, payerId, splitMode, amountCents, description,
  categoryId: string | null, categorySlug: string | null,
  tags: { id: string; name: string }[],
  bookedAt: string,               // ISO
  dateSource: "exact" | "day" | "month" | "estimated",
  origin, planPeriod: string | null,
  createdBy: string | null, createdAt: string, updatedAt: string,
  // abgeleitet, vom Server mitgeliefert, damit der Client nicht rechnet:
  otherShareCents: number,        // was die NICHT-zahlende Person trägt
  payerShareCents: number,        // Komplement, exakt
  balanceDeltaCents: number,      // Beitrag zum Saldo aus Sicht von member_slot 1
  isExpense: boolean,             // splitMode !== "SETTLEMENT"
}

CreateTransactionRequest = {
  kind: "MINE_SPLIT" | "THEIRS_SPLIT" | "FOR_THEM" | "TRANSFER",
  amountCents: number,            // signed, != 0
  description: string,            // 1..200
  categoryId?: string | null,
  tags?: string[],                // Namen, nicht Ids; unbekannte werden angelegt
  bookedAt?: string,              // ISO; Default: jetzt
  mutationId?: string,
}

UpdateTransactionRequest = Partial<CreateTransactionRequest> & { mutationId?: string }
```

Anmerkungen

* **Der Client sendet `kind`, der Server speichert `(payerId, splitMode)`.** Die Übersetzung ist
  `kindToStorage(kind, viewerId, otherId)` aus `@toon/shared` und passiert **serverseitig**, damit ein
  offline nachgespielter Aufruf nicht davon abhängt, wer gerade eingeloggt ist — der Betrachter steckt
  in der Session, nicht im Body.
* **`kind` im Query-Filter ist ebenfalls eine Projektion** und wird serverseitig gegen den Betrachter
  in `(payerId, splitMode)` aufgelöst. `splitMode` + `payerId` bleiben als rohe Filter erhalten, weil
  die Übersichtskarten sie brauchen.
* **Negative Beträge sind gültig** (Erstattungen, Gutschriften, Korrekturen) und ihr Vorzeichen ist
  bedeutungstragend. Der **einzige** verbotene Betrag ist `0` → `422 transaction_amount_zero`.
* `tags` sind **Namen**; der Service normalisiert (`normalizeTagName`), legt unbekannte an
  (`tags(household_id, name_key)` ist unique → case-insensitiver Upsert) und ersetzt die Verknüpfungen
  vollständig, wenn das Feld im PATCH vorhanden ist, und lässt sie unangetastet, wenn es fehlt
  (**replace-all-when-present**, dieselbe PATCH-Semantik wie im Referenz-Repo).
* `PATCH` und `DELETE` treffen **nur** `origin = 'manual'`. Alles andere ist `409
  transaction_generated` — eine generierte Zeile wird nicht bearbeitet, sondern durch eine
  Korrekturbuchung ausgeglichen (§3.7).
* `mutationId` wird über `claimMutation()` eingelöst. Ein bekannter Anspruch antwortet mit **200** und
  dem aktuellen Zustand der verknüpften Zeile, nie mit 201 und nie mit 409.
* `GET /summary` liefert die Aggregate der Übersicht in **einem** Aufruf, damit der Dashboard-Screen
  nicht fünf Queries feuert:

  ```ts
  TransactionSummaryQuery    = { from?: string; to?: string; includeAggregates?: boolean }
  TransactionSummaryResponse = {
    from: string; to: string;
    totalExpenseCents: number;          // Summe aller isExpense-Zeilen
    byCategory: { categoryId: string | null; categorySlug: string | null; totalCents: number; count: number }[];
    byMonth: { period: string; totalCents: number; balanceDeltaCents: number }[];
    settlementTotalCents: number;
  }
  ```

  Settlements sind aus `totalExpenseCents` und `byCategory` **ausgeschlossen** — sie sind
  Schuldenbewegung, kein Verbrauch. Das ist eine einzige exportierte Prädikatsfunktion
  (`isExpense(tx)`), kein Ad-hoc-Filter an jeder Aufrufstelle.

### 3.7 Fixkostenplan — `apps/api/src/routes/plan.ts`

Gemountet auf `/api/households/:householdId/plan`.

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `…/plan` | household | – | `PlanResponse` | 200, 403, 404 |
| PATCH | `…/plan` | household | `UpdatePlanRequest` | `PlanResponse` | 200, 403, 404, 422, 409 `plan_period_locked` |
| GET | `…/plan/preview` | household | `?period=YYYY-MM` | `PlanComputationResponse` | 200, 403, 404, 409 `plan_incomplete`, 422 `plan_period_out_of_range` |
| POST | `…/plan/run` | household | `RunPlanRequest` | `RunPlanResponse` | 200, 403, 404, 409 `plan_disabled`, 409 `plan_incomplete` |
| POST | `…/plan/recalculate` | household | `RecalculatePlanRequest` | `RecalculatePlanResponse` | 200, 403, 404, 409 `plan_disabled` |
| GET | `…/plan/runs` | household | `PaginationQuery` | `AccrualRunListResponse` | 200, 403, 404 |
| POST | `…/plan/items` | household | `CreateFixedCostItemRequest` | `FixedCostItemResponse` | 201, 403, 404, 422 |
| PATCH | `…/plan/items/:itemId` | household | `UpdateFixedCostItemRequest` | `FixedCostItemResponse` | 200, 403, 404, 422 |
| DELETE | `…/plan/items/:itemId` | household | – | – | 204, 403, 404 |
| POST | `…/plan/incomes` | household | `CreateIncomeRequest` | `IncomeResponse` | 201, 403, 404, 409 `conflict`, 422 |
| PATCH | `…/plan/incomes/:incomeId` | household | `UpdateIncomeRequest` | `IncomeResponse` | 200, 403, 404, 409 `conflict`, 422 |
| DELETE | `…/plan/incomes/:incomeId` | household | – | – | 204, 403, 404 |

```ts
UpdatePlanRequest = { enabled?: boolean; payerId?: string; startPeriod?: string }

PlanResponse = {
  plan: { enabled, payerId, startPeriod, lastBookedPeriod: string | null },
  items:   FixedCostItemResponse[],
  incomes: IncomeResponse[],
  current: PlanComputationResponse | null,     // null wenn plan_incomplete
  lastRun: AccrualRunResponse | null,
  pendingPeriods: string[],                    // was ein Lauf jetzt buchen würde
}

FixedCostItemResponse = { id, label, amountCents, activeFrom, activeTo: string | null, position }
IncomeResponse        = { id, personId, amountCents, validFrom, validTo: string | null }

PlanComputationResponse = {
  period: string,
  costTotalCents: number,
  incomeTotalCents: number,
  quoteNumerator: number,        // = costTotalCents  — die Quote bleibt ein Bruch
  quoteDenominator: number,      // = incomeTotalCents
  shares: { personId: string; incomeCents: number; shareCents: number }[],
  payerId: string,
  bookableCents: number,         // der Anteil der NICHT-zahlenden Person
  booked: boolean,               // existiert schon eine Buchung für diese Periode?
}

RunPlanRequest  = { through?: string }                // Default: aktuelle Periode
RunPlanResponse = { bookedPeriods: string[]; skippedPeriods: string[]; bookedCents: number; run: AccrualRunResponse }

RecalculatePlanRequest = { dryRun: boolean }
RecalculatePlanResponse = {
  items: { period: string; bookedCents: number; recomputedCents: number; deltaCents: number }[],
  totalDeltaCents: number,
  applied: boolean,
  adjustments: TransactionResponse[],          // leer bei dryRun
}
```

Anmerkungen

* **Die Quote wird nie als Float weitergereicht.** `quoteNumerator/quoteDenominator` gehen als
  ganzzahliger Bruch auf die Leitung; die UI formatiert daraus `23,75 %`
  (`Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 2 })`). Der Anteil entsteht in
  **einem** Integer-Ausdruck: `divRoundHalfAwayFromZero(income × costTotal, incomeTotal)` — genau eine
  Rundung.
* **Nur der Anteil der anderen Person wird gerundet und gebucht.** `payerShare = costTotal − otherShare`,
  per Definition. Die UI rendert `payerShare` als Komplement, **nie** über einen zweiten Rundungsaufruf
  — sonst summieren sich die zwei angezeigten Zahlen auf `costTotal ± 1` und der Nutzer sieht es.
* **`bookableCents === 0` bucht nichts.** Die „Betrag ≠ 0"-Invariante gilt auch für generierte Zeilen.
* **Der Lauf ist historisch.** Periode `2026-03` wird aus den Positionen und Gehältern berechnet, die
  **in** März 2026 galten, auch wenn der Lauf im August passiert. Genau dafür existieren `activeFrom` /
  `validFrom`.
* **Der Lauf bucht nie die Zukunft.** `to = currentPeriod()` (Europe/Berlin), inklusive. Eine Periode
  wird am oder nach ihrem Ersten gebucht, nie vorher.
* **Ausgelöst wird der Catch-up dreifach**, ohne Cron-Abhängigkeit: einmal beim API-Boot nach den
  Migrationen und **vor** dem Annehmen von Traffic; alle 6 Stunden per `setInterval` (billig — eine
  indizierte Query, wenn nichts zu tun ist); und auf Zuruf per `POST …/plan/run`. Alle drei Wege gehen
  durch dieselbe Funktion und schreiben eine `accrual_runs`-Zeile.
* **Gebuchte Perioden sind unveränderlich.** `recalculate` schreibt **neue** Anpassungsbuchungen
  (`origin: 'fixed_plan_adjustment'`, `amountCents = recomputed − booked`, `externalKey =
  fixedplan-adj:{hh}:{p}:{bookedCents}`) und rührt die alten Zeilen nicht an. Der superseded Betrag
  steckt im `externalKey`, damit eine zweite Gehaltskorrektur eine zweite, eigene Anpassung erzeugt,
  während ein erneuter Lauf gegen unveränderte Daten kollidiert und nichts tut. Grund: die beiden
  Personen gleichen gegen einen Saldo aus, den beide gesehen haben — eine rückwirkende Änderung würde
  eine bereits geleistete Zahlung still nicht mehr passen lassen.
* `plan_incomplete` heißt: keine in `p` aktive Position, oder für eine der beiden Personen kein in `p`
  gültiges Einkommen, oder zwei überlappende Einkommenszeilen derselben Person. Der Service prüft die
  Überlappung, die DB fängt nur den Sonderfall „gleiches `validFrom`".

### 3.8 Saldo — `apps/api/src/routes/balance.ts`

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `…/balance` | household | `?includeAggregates=` | `BalanceResponse` | 200, 403, 404 |
| GET | `…/balance/history` | household | `?from=&to=&includeAggregates=` | `BalanceHistoryResponse` | 200, 403, 404, 422 |

```ts
BalanceResponse = {
  balanceCents: number,          // POSITIV = member_slot 2 schuldet member_slot 1
  perspectiveUserId: string,     // die Person mit member_slot 1
  viewerUserId: string,
  viewerBalanceCents: number,    // = balanceCents, negiert wenn der Betrachter Slot 2 ist
  asOf: string,
  breakdown: {
    splitOtherCents: number,     // Σ halfForOther über SPLIT_EQUAL, vorzeichenrichtig
    forOtherCents: number,       // Σ OTHER_ONLY
    settledCents: number,        // Σ SETTLEMENT
    transactionCount: number,
  },
}

BalanceHistoryResponse = { items: { period: string; deltaCents: number; balanceCents: number }[] }
```

* **Eine Konvention, einmal gewählt**: `balanceCents > 0` = Slot 2 schuldet Slot 1. Sie steht als
  Doc-Kommentar am Rückgabetyp von `computeBalance` in `@toon/shared`.
* Die UI zeigt **nie ein rohes Vorzeichen**, sondern `viewerBalanceCents` durch drei Katalogschlüssel:
  `balance.owesYou` (`{name} schuldet dir {amount}`), `balance.youOwe` (`Du schuldest {name} {amount}`),
  `balance.settled` (`Ausgeglichen`). Drei Schlüssel, nicht drei fest verdrahtete Sätze.
* Das `breakdown` existiert, damit der Screen zeigen kann **warum** die Zahl so ist, ohne sie
  clientseitig noch einmal herzuleiten. Zwei Herleitungen desselben Betrags sind zwei Gelegenheiten,
  auseinanderzulaufen.
* `includeAggregates=false` blendet Zeilen mit dem Tag `sammelbuchung` aus (die eine importierte
  41.280,99-€-Sammelzeile). Für `/balance` ist der Default **true** — der aktuelle Saldo ist ohne sie
  falsch. Für `/balance/history` bietet die UI den Schalter an, weil die Zeile sonst jedes Diagramm
  plattdrückt.

### 3.9 Ausgleichszahlungen — `apps/api/src/routes/settlements.ts`

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `…/settlements` | household | `PaginationQuery` | `TransactionListResponse` | 200, 403, 404 |
| POST | `…/settlements` | household | `CreateSettlementRequest` | `SettlementResponse` | 201 (200 bei Replay), 403, 404, 409 `balance_stale`, 422 |

```ts
CreateSettlementRequest = {
  expectedBalanceCents: number,     // PFLICHT — der Saldo, den der Client angezeigt hat
  amountCents?: number,             // Default: Math.abs(Saldo); muss > 0 sein
  note?: string,
  bookedAt?: string,
  mutationId?: string,
}
SettlementResponse = { transaction: TransactionResponse; balance: BalanceResponse }
```

* **Es gibt keine eigene `settlements`-Tabelle.** Eine Ausgleichszahlung ist eine Transaktion mit
  `splitMode: 'SETTLEMENT'`; `payerId` ist die Person, die das Geld herausgibt. Dieser Endpunkt ist die
  bequeme Hülle, die den Zahler aus dem Vorzeichen des Saldos ableitet (`balance > 0` → Slot 2 zahlt).
  `GET …/settlements` ist derselbe Reader wie `GET …/transactions?splitMode=SETTLEMENT`.
* **`expectedBalanceCents` ist Pflicht.** Passt es nicht mehr zum aktuellen Saldo — die andere Person
  hat vor dreißig Sekunden etwas gebucht —, antwortet der Server `409 balance_stale` mit
  `details.currentBalanceCents`, und der Client fragt neu. Gegen eine Zahl auszugleichen, die man nicht
  gesehen hat, ist das einzige Rennen in dieser App, das echtes Geld kostet.
* **Teilzahlungen brauchen keinen Sonderfall**: weniger als `|b|` lässt den Rest offen, mehr dreht das
  Vorzeichen. Überzahlung ist erlaubt (Menschen runden auf 50 € auf) und wird als negativer Saldo klar
  benannt, nicht geklemmt. `amountCents <= 0` ist `422 settlement_amount_invalid`.
* **Ausgleichszahlungen werden nie automatisch erzeugt.** Die Monatsbuchung erzeugt *Schuld*, keine
  Zahlung.
* Die umgekehrte Richtung (der Betrachter zahlt an die andere Person) entsteht **hier**, aus dem
  Vorzeichen — nicht über einen fünften Knopf im Erfassen-Flow.

### 3.10 Kategorien und Tags

`apps/api/src/routes/categories.ts`, gemountet auf `…/categories`:

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `…/categories` | household | `?includeHidden=` | `CategoryListResponse` | 200, 403, 404 |
| POST | `…/categories` | household | `CreateCategoryRequest` | `CategoryResponse` | 201, 403, 404, 409 `category_slug_taken`, 422 |
| PATCH | `…/categories/:categoryId` | household | `UpdateCategoryRequest` | `CategoryResponse` | 200, 403, 404, 409 `category_system`, 422 |
| DELETE | `…/categories/:categoryId` | household | `?reassignTo=` | – | 204, 403, 404, 409 `category_in_use`, 409 `category_system` |

```ts
CategoryResponse       = { id, slug, label: string, customLabel: string | null,
                           isSystem: boolean, isHidden: boolean, position: number, usageCount: number }
CreateCategoryRequest  = { label: string; position?: number }
UpdateCategoryRequest  = { label?: string; isHidden?: boolean; position?: number }
```

* `label` in der Response ist **fertig gerendert**: `customLabel ?? t(categories.name.<slug>)` in der
  verhandelten Locale. Der Client zeigt `label` an und schickt beim Umbenennen `label` zurück, was
  `customLabel` setzt — ab dann ist es gespeicherter Inhalt und wird nie wieder übersetzt.
* Eine neu angelegte Kategorie bekommt `slug = "custom-" + id.slice(0, 8)`, damit der Namensraum der
  Default-Slugs unberührt bleibt.
* `fixkosten` ist `isSystem` und antwortet auf Umbenennen und Löschen mit `409 category_system`.
* Löschen mit Buchungen daran ist `409 category_in_use`, **es sei denn** `?reassignTo=<categoryId>` ist
  gesetzt — dann werden die Buchungen in einer Transaktion umgehängt und die Kategorie gelöscht. Ohne
  diesen Weg wäre die einzige Alternative, `category_id` still auf `NULL` zu setzen, und der Nutzer
  fände seine Ausgaben nur unter „ohne Kategorie" wieder.

`apps/api/src/routes/tags.ts`, gemountet auf `…/tags`:

| Methode | Pfad | Auth | Request | Response | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `…/tags` | household | `?q=&limit=` | `TagListResponse` | 200, 403, 404 |
| PATCH | `…/tags/:tagId` | household | `UpdateTagRequest` | `TagResponse` | 200, 403, 404, 409 `tag_name_taken`, 422 |
| DELETE | `…/tags/:tagId` | household | – | – | 204, 403, 404 |

```ts
TagResponse     = { id, name, usageCount }
UpdateTagRequest= { name: string }
```

* Es gibt **kein `POST /tags`**: Tags entstehen ausschließlich als Nebenwirkung des Anlegens einer
  Buchung. Ein Tag ohne Buchung ist Datenmüll.
* `GET …/tags` ohne `q` liefert die häufigsten (nach `usageCount` absteigend, Default-Limit 20) — das
  sind die Vorschläge im Erfassen-Flow. Mit `q` ist es ein Präfix-Match auf `nameKey`.
* `DELETE` löst die Verknüpfungen (Cascade über `transaction_tags`) und löscht den Tag; Buchungen
  bleiben unangetastet.

---

## 4. Screens und Navigation

### 4.1 Die Navigationsachse

`apps/web/src/components/layout/nav-items.ts` ist die **einzige** Quelle. `NAV_ITEMS` ist zugleich die
Tab-Bar auf dem Handy und der Kopf der Sidebar; `SECONDARY_NAV_ITEMS` ist nur Sidebar. Die Items tragen
Katalog-**Keys**, keine Labels — ein zur Importzeit aufgelöstes Label friert die Tab-Bar auf der zuerst
geladenen Sprache ein.

| | Route | Key | Icon (lucide) |
| --- | --- | --- | --- |
| **Tab 1** | `/` | `nav.overview` — *Übersicht* | `wallet` |
| **Tab 2** | `/transactions` | `nav.transactions` — *Buchungen* | `list` |
| **Tab 3** | `/new` | `nav.create` — *Erfassen* | `plus-circle` |
| **Tab 4** | `/settings` | `nav.profile` — *Profil* | `user` |
| Sidebar | `/plan` | `nav.plan` — *Fixkosten* | `repeat` |
| Sidebar | `/categories` | `nav.categories` — *Kategorien* | `tags` |
| Sidebar | `/household` | `nav.household` — *Haushalt* | `users` |

Nur `/` ist `exact: true`.

**Unterhalb von `lg` gibt es KEINE Sidebar.** Jeder `SECONDARY_NAV_ITEMS`-Eintrag muss darum von einem
Tab-Screen aus erreichbar sein, sonst ist er auf dem Handy nicht existent:

* **Fixkosten `/plan`** ← die Karte **`FixedCostCard`** auf `/` (Tab 1). Sie zeigt Monatsanteil, Quote
  und „nächste Buchung" und ist als Ganzes ein Link auf `/plan`. Diese Karte zu löschen, kappt den
  Fixkostenplan auf dem Handy — und er ist der Grund, warum es die App gibt.
* **Kategorien `/categories`** ← der Fußzeilen-Link **`categories.manage`** („Kategorien verwalten") in
  der Karte **`SpendByCategoryCard`** auf `/` (Tab 1). Zusätzlich, aber **nicht** als Ersatz: der
  Kategorie-Picker im Erfassen-Flow hat unten denselben Link.
* **Haushalt `/household`** ← die Karte **`HouseholdCard`** auf `/settings` (Tab 4). Dort sitzt auch die
  Einladung der zweiten Person; ohne diese Karte ist ein frisch installierter Haushalt auf dem Handy
  nicht zu zweit zu bekommen.

**Warum vier Tabs und warum „Erfassen" einer davon ist.** Der Erfassen-Flow ist der einzige Screen,
den beide Personen mehrmals pro Woche benutzen, und der einzige, der offline funktionieren muss. Ein
schwebender „+"-Knopf über einer Liste wäre ein Ziel weniger in der Daumenzone und würde beim
Scrollen Inhalt verdecken. Ein Saldo-eigener Tab wäre redundant: der Saldo ist die Kopfzeile von `/`.

### 4.2 Route-Baum

Öffentliche Screens werden **statisch** importiert (sie müssen ohne Session und ohne Bundle-Splitting
laden), alles unter `appRoute` über `lazyPage`.

```
/login                      LoginPage                   public, statisch
/register                   RegisterPage                public, statisch  (?invite=<token>)
/password/forgot            ForgotPasswordPage          public, statisch
/password/reset             ResetPasswordPage           public, statisch  (?token=)
/invite/$token              InvitePage                  public, statisch
appRoute (pathless, RequireAuth + RequireHousehold + AppShell)
  /                         OverviewPage                Tab 1
  /transactions             TransactionsPage            Tab 2   (Filter in der URL)
  /transactions/$transactionId        TransactionDetailPage
  /transactions/$transactionId/edit   EditTransactionPage
  /new                      NewTransactionPage          Tab 3
  /settings                 SettingsPage                Tab 4
  /plan                     PlanPage                    Sidebar
  /categories               CategoriesPage              Sidebar
  /household                HouseholdPage               Sidebar
*                           NotFoundPage
```

Die Filterparameter der Buchungsliste stehen als **eine Konstante** im Router, weil `pick()` alles
Ungelistete verwirft:

```ts
const TX_FILTER_PARAMS = ["from","to","kind","categoryId","tagIds","origin","q","sort"] as const;
```

Eine Redirect-Route auf `/transactions` muss **dieselben** Params deklarieren — `validateSearch` läuft
vor `beforeLoad`.

`RequireHousehold` ist das Gegenstück zu toon-recipes `RequireActiveGroup`: kein Haushalt (Code
`household_required`) → Weiterleitung auf `/household` mit der Anlege-Karte statt einer leeren App.

### 4.3 `/` — Übersicht (Tab 1)

Die Antwort auf „wie stehen wir gerade" in einem Blick, ohne Scrollen auf 390 px für die erste Karte.
Von oben nach unten:

1. **`BalanceHero`** — die einzige große Zahl des Screens. `viewerBalanceCents`, formatiert
   `de-DE`/EUR, darüber der Satz aus `balance.owesYou` / `balance.youOwe` / `balance.settled` mit dem
   Anzeigenamen der anderen Person. Darunter zwei Knöpfe: **„Jetzt ausgleichen"** (öffnet
   `SettleDialog`) und **„Details"** (klappt `breakdown` auf: geteilt / für {name} / ausgeglichen /
   Anzahl Buchungen). Bei `balanceCents === 0` entfällt der Ausgleichen-Knopf.
2. **`FixedCostCard`** — Link auf `/plan`. Zeigt: Monatsanteil der anderen Person (`bookableCents`),
   die Quote als `23,75 %`, den Monat der letzten Buchung und, falls `pendingPeriods.length > 0`, eine
   Warnzeile `plan.pendingNotice` mit dem Knopf „Jetzt buchen" (`POST …/plan/run`). Ist der Plan aus,
   zeigt die Karte `plan.disabledHint` und einen Link zum Einrichten.
3. **`MonthSummaryCard`** — Ausgaben des laufenden Monats (`totalExpenseCents`), Vergleich zum
   Vormonat als Delta, und die Zahl der Buchungen. Settlements sind hier nicht enthalten.
4. **`SpendByCategoryCard`** — die Top-6 Kategorien des gewählten Zeitraums als Balkenliste
   (Anteil als Breite, Betrag rechts), Rest als „Sonstige". Fußzeile: Link `categories.manage` →
   `/categories`. Zeitraumauswahl (`Dieser Monat` / `Letzter Monat` / `Dieses Jahr` / `Gesamt`) sitzt
   im Kartenkopf und steuert auch Karte 3.
5. **`RecentTransactionsCard`** — die letzten 5 Buchungen als kompakte Zeilen, Fußzeile „Alle
   Buchungen" → `/transactions`. Die Zeilen sind **nicht** dieselbe Komponente wie in der Liste (siehe
   §5, WEB-TX und WEB-SALDO teilen keine Datei) — sie rendern aus `TransactionResponse` über die
   gemeinsamen Primitives in `components/money/`.

Datenquelle: `GET …/balance`, `GET …/transactions/summary`, `GET …/plan`, `GET …/transactions?limit=5`.
Alle vier mit `networkMode: "offlineFirst"`, alle vier persistiert.

### 4.4 `/transactions` — Buchungen (Tab 2)

* Kopf: `PageHeader` mit Titel und einem einzigen Overflow-Trigger (`ActionMenu`) — **keine Reihe von
  Icon-Buttons**. Darin: „Filter zurücksetzen", „Sammelbuchungen ausblenden", „Nur eigene".
* Darunter eine immer sichtbare Suchzeile (`q`) und eine horizontal scrollende Chip-Reihe für die
  aktiven Filter. Der volle Filtersatz (Zeitraum, Art, Kategorie, Tags, Herkunft) liegt in einem
  aufklappbaren Panel `transactions.filter.title`. Jeder Filter steht in der URL.
* Die Liste ist **nach Tagen gruppiert**, absteigend, mit klebriger Datums-Überschrift. Eine Zeile
  zeigt: Beschreibung (einzeilig, `block` + `line-clamp-1`), Kategorie-Label + bis zu zwei Tags als
  kleine Chips, rechts den Betrag und darunter kleiner den eigenen Anteil. Ein `~` vor dem Datum
  markiert `dateSource === 'estimated'`. Generierte Zeilen (`origin ≠ 'manual'`) tragen ein
  `KindBadge` mit dem Katalogtext `transactions.origin.plan` bzw. `.import`.
* Paginierung: „Mehr laden" (`offset`), kein Infinite Scroll — eine Liste, in der man ein Datum sucht,
  darf nicht unter dem Finger weglaufen.
* Zeile tippen → `/transactions/$transactionId`.
* Leerzustand: `EmptyState` mit `transactions.empty.title` / `.description` und dem Knopf „Erste
  Buchung erfassen" → `/new`.

`/transactions/$transactionId` zeigt alle Felder inklusive `payerShareCents` / `otherShareCents` /
`balanceDeltaCents`, die Herkunft im Klartext und — nur bei `origin === 'manual'` — „Bearbeiten" und
„Löschen" (mit `ConfirmDialog`). Bei generierten Zeilen steht dort stattdessen der Hinweis
`transactions.generatedHint` mit einem Link auf `/plan`.

### 4.5 `/new` — Erfassen (Tab 3) — der wichtigste Screen

Anforderung: **auf einem 390-px-Handy mit einer Hand bedienbar, vier Arten klar unterscheidbar,
offline funktionsfähig.** Der Screen ist ein einspaltiges Formular ohne Karten-Verschachtelung.

**Reihenfolge und Begründung.** Der Betrag steht ganz oben, weil er das erste ist, was man weiß, und
weil der numerische Tastaturblock beim Fokus die untere Bildschirmhälfte belegt — alles, was darunter
liegt, wäre sonst verdeckt. Die Aktionsleiste sitzt unten und ist klebrig, weil sie in der Daumenzone
sein muss.

```
┌──────────────────────────────────────┐
│  Betrag                              │   AmountInput
│  ┌────────────────────────────────┐  │   • inputMode="decimal", autoFocus
│  │                      12,50 €   │  │   • rechtsbündig, text-4xl, tabular-nums
│  └────────────────────────────────┘  │   • akzeptiert "1.234,56" / "1234,56" / "1234.56"
│  [ Erstattung / Gutschrift ]         │   • Toggle dreht das Vorzeichen (nicht "-" tippen)
│                                      │
│  Art                                 │   KindPicker, 2×2-Raster
│  ┌───────────────┬────────────────┐  │   • jede Kachel min. 88 px hoch, volle Spaltenbreite
│  │ Geteilt — ich │ Geteilt — Robin│  │   • Icon + Titel + einzeilige Erklärung
│  ├───────────────┼────────────────┤  │   • ausgewählt = Rahmen + Häkchen, nicht nur Farbe
│  │ Für Robin     │ Ausgleich      │  │   • radiogroup, Pfeiltasten, focus-visible
│  └───────────────┴────────────────┘  │
│  → Erklärzeile zur gewählten Art     │   z.B. "Ihr teilt 12,50 € — Robin trägt 6,25 €"
│                                      │       (live berechnet, halfForOther aus @toon/shared)
│  Beschreibung                        │   Input, 1..200
│  ┌────────────────────────────────┐  │
│  └────────────────────────────────┘  │
│                                      │
│  ▸ Mehr Details                      │   collapsible, standardmäßig ZU
│    Kategorie · Tags · Datum          │
├──────────────────────────────────────┤
│  [        Buchen        ]            │   sticky, .bottom-tabbar (NIE bottom-0)
└──────────────────────────────────────┘
```

* **Die vier Kacheln** tragen Titel und Erklärung aus dem Katalog, mit `{name}` = Anzeigename der
  anderen Person: `transactions.kind.mineSplit.*`, `.theirsSplit.*`, `.forThem.*`, `.transfer.*`
  (Texte in §6.5). Unterscheidbar sind sie durch **drei** Signale gleichzeitig — Icon, Titel und die
  Live-Erklärzeile darunter —, nie durch Farbe allein.
* **Voreinstellung**: `MINE_SPLIT`. Das ist die mit Abstand häufigste Art (111 von 263 importierten
  Zeilen) und macht den schnellen Pfad zu drei Eingaben: Betrag → Beschreibung → Buchen.
* **Kategorie** wird im „Mehr Details"-Block als Bottom-Sheet gewählt (`Dialog` von unten, 2-spaltiges
  Raster großer Ziele, Suchfeld oben, Fußzeile „Kategorien verwalten"). Wird keine gewählt, bleibt sie
  leer — **kein automatisches „Sonstiges"**, damit die Übersicht ehrlich zeigt, was noch einzuordnen
  ist.
* **Tags**: Freitextfeld mit den Top-8 des Haushalts als antippbare Chips darüber (`GET …/tags`).
  Enter oder Komma legt an.
* **Datum**: Standard „heute", ein `Select` mit `Heute` / `Gestern` / `Datum wählen…`.
* **Nach dem Buchen** bleibt der Nutzer auf `/new`: das Formular wird geleert, die Art bleibt stehen,
  und ein Toast (`transactions.toast.created`) trägt die Aktion „Rückgängig" (löscht die eben
  angelegte Zeile) für 6 Sekunden. Wer eine Quittungsstapel abarbeitet, erfasst mehrere hintereinander.
* **Offline**: die Mutation ist als `TX_MUTATION_KEYS.create` in `setMutationDefaults` registriert,
  läuft mit `networkMode: "offlineFirst"`, wird optimistisch in den Cache geschrieben und pausiert
  ohne Netz. Der Toast lautet dann `transactions.toast.queued` („Gespeichert. Wird übertragen, sobald
  du online bist."). Die `mutationId` wird **beim Aufruf** gemünzt, nie in der `mutationFn` — die
  läuft beim Replay erneut.
* **`useUnsavedWork(dirty)`** wird gesetzt, solange Betrag oder Beschreibung gefüllt sind, damit ein
  wartendes Service-Worker-Update nicht mitten in der Eingabe neu lädt. Eine **wartende Mutation** zählt
  ausdrücklich **nicht** als unsaved work — sie liegt in IndexedDB und wird nach dem Reload gespielt.
* `/transactions/$transactionId/edit` rendert dieselben Feldkomponenten, aber als eigener Screen mit
  „Speichern" statt „Buchen" — die Formularfelder liegen in `components/TransactionFormFields.tsx`,
  die beiden Screens sind getrennt, damit „nach dem Speichern bleiben" und „nach dem Speichern zurück"
  nicht in einer Komponente durch ein Flag entschieden werden.

### 4.6 `/plan` — Fixkosten (Sidebar, mobil über `FixedCostCard`)

Drei Blöcke plus Kopfzeile.

1. **Kopf**: `Switch` „Plan aktiv", darunter die Zusammenfassung der aktuellen Periode:
   `Fixkosten gesamt 1.187,50 €` · `Einkommen gesamt 5.000,00 €` · `Quote 23,75 %` ·
   **`Robin zahlt 470,86 €`** groß hervorgehoben · `Alex trägt 716,64 €` als Komplement.
   Zahler-Auswahl (`payerId`) und `startPeriod` in einem `ActionMenu`.
2. **`Fixkosten`** — Liste der Positionen mit Label, Betrag, Gültigkeit (`ab 09/2025`, `09/2025–03/2026`).
   „Hinzufügen" und pro Zeile „Bearbeiten". **Bearbeiten schlägt vor, die alte Zeile zum Vormonat zu
   schließen und eine neue anzulegen** (`plan.items.supersedeHint`) — nur so bleibt jede Periode
   reproduzierbar. Der Betrag einer laufenden Zeile lässt sich trotzdem korrigieren (Tippfehler), dann
   mit dem Hinweis, dass gebuchte Perioden davon unberührt bleiben.
3. **`Einkommen`** — dieselbe Struktur, eine Zeile pro Person und Zeitraum.
4. **`Buchungen`** — die letzten gebuchten Perioden aus `GET …/transactions?origin=fixed_plan`, mit
   Betrag und Datum, plus die `pendingPeriods` als hervorgehobene Zeilen mit „Jetzt buchen".
5. **`Neuberechnung`** — Knopf `plan.recalculate.title`. Öffnet einen Dialog, der zuerst
   `POST …/plan/recalculate { dryRun: true }` ruft und die Tabelle
   *Periode · gebucht · neu berechnet · Differenz* mit Gesamtsumme zeigt, dann explizit bestätigen
   lässt. Ergebnis: neue Anpassungsbuchungen, keine geänderten Zeilen. Ist die Vorschau leer, steht dort
   `plan.recalculate.none`.
6. Fußzeile: „Letzter Lauf: 09.08.2026, 2 Perioden gebucht" aus `GET …/plan/runs`.

### 4.7 `/categories` — Kategorien (Sidebar, mobil über `SpendByCategoryCard`)

Sortierbare Liste aller Kategorien mit Label, Nutzungszahl und Sichtbarkeits-Schalter. `fixkosten` trägt
ein `Badge` `categories.system` und hat kein Löschen. Löschen mit Buchungen öffnet einen Dialog, der
eine Ziel-Kategorie zum Umhängen verlangt (`?reassignTo=`). „Hinzufügen" legt eine Kategorie mit
`custom-`-Slug an. Umbenennen setzt `customLabel` — mit dem Hinweis `categories.renameHint`, dass die
Kategorie danach nicht mehr mit der Oberflächensprache wechselt.

### 4.8 `/household` — Haushalt (Sidebar, mobil über `HouseholdCard` auf `/settings`)

Name des Haushalts (editierbar), die beiden Mitglieder mit Anzeigename, Slot und Beitrittsdatum, der
eigene Anzeigename als Feld. Ist ein Slot frei: die Einladungs-Karte mit „Einladung erstellen",
danach der Link zum Kopieren **plus** eine ehrliche Statuszeile aus `mailDelivery`
(`settings.household.mailSent` / `.mailNotConfigured` / `.mailFailed`). Ist der Haushalt voll, steht
dort `settings.household.full`. Ganz unten „Haushalt verlassen" mit `ConfirmDialog`; scheitert es mit
`member_has_ledger`, erklärt der Fehlertext, dass zuerst die Buchungen dieser Person weg müssen.

### 4.9 `/settings` — Profil (Tab 4)

`ProfileCard` (Name, E-Mail, Speichern) · `PasswordCard` (Passwort ändern) · **`HouseholdCard`** (Name,
beide Mitglieder, „Haushalt verwalten" → `/household`; **der einzige mobile Weg dorthin**) ·
`LanguageCard` (System / Deutsch / English — die Autonyme sind in **beiden** Katalogen identisch, damit
man aus einer unlesbaren Sprache zurückfindet) · `ThemeCard` (System / Hell / Dunkel) ·
`SessionsCard` (aktive Sitzungen mit Handle, „Abmelden") · `AboutCard` (Version) · „Abmelden".

### 4.10 Layout-Regeln, die nicht verhandelbar sind

* `<main>` besitzt `mx-auto max-w-5xl px-gutter pt-4 pb-tabbar`. **Eine Page-Root wiederholt davon
  nichts** — Page-Roots sind `flex flex-col gap-4` (oder `flex-1 flex flex-col`).
* Die breitere Desktop-Gutter ist eine **Variable** (`lg:[--gutter:2rem]`), kein zweites
  Padding-Utility: die handgeschriebenen Utilities in `styles/index.css` werden nach Tailwind emittiert
  und würden `lg:px-8` schlagen.
* **`.px-safe` niemals neben `px-4`** — `.px-gutter` benutzen.
* **Klebrige Leisten brauchen `.bottom-tabbar`, nie `bottom-0`.** Die „Buchen"-Leiste auf `/new` und
  die „Ausgleichen"-Leiste im Dialog sind genau der Fall: mit `bottom-0` liegen sie auf dem Handy unter
  der Tab-Bar und sind nicht antippbar.
* Eine klebrige Fußleiste braucht eine **ungebrochene Flex-Kette**: `min-h-dvh` → `<main> flex-1 flex
  flex-col` → Page-Root `flex-1` → Spacer `flex-1`.
* `controlClasses` trägt `min-w-0`; in Grid-Templates `minmax(0,1fr)` statt `1fr`. Betrag und Datum
  stehen nebeneinander in `grid-cols-2` — genau der Fall, in dem `1fr` überläuft.
* Ein `<fieldset>` hat `min-inline-size: min-content` und braucht explizit `min-w-0`.
* `block` schlägt `line-clamp-N` — Buchungstexte, die gekürzt werden, brauchen beides in der richtigen
  Reihenfolge.
* Ein Header bekommt **einen** Overflow-Trigger (`ActionMenu`), keine Reihe von Icon-Buttons.
* `apple-mobile-web-app-status-bar-style: black-translucent` ist verboten; `viewport-fit=cover` +
  `<meta theme-color>` ist der Ersatz.
* Touch-Ziele mindestens 44 px; keine Hover-only-Affordanzen; `focus-visible`-Ringe überall.
* Das Handy-Layout wird im **echten Headless-Browser** bei 390 px verifiziert, nicht durch Lesen von
  Tailwind-Klassen.

---

## 5. Datei-Layout

Vollständige Arbeitsteilung. Jede Zeile ist ein anzulegender Pfad. Besitzer-Tags:
`[GERÜST]` `[SHARED]` `[API-KERN]` `[API-DOMÄNE]` `[WEB-KERN]` `[WEB-TX]` `[WEB-SALDO]` `[OFFLINE]`
`[IMPORT]`.

**Regel für parallele Arbeit:** `WEB-TX` und `WEB-SALDO` besitzen **keine gemeinsame Datei**. Alles,
was beide brauchen — `lib/api.ts`, `lib/queries.ts` (sämtliche Query-Keys, auch die der jeweils anderen
Gruppe), `components/money/*`, die Kataloge — gehört `WEB-KERN` und wird **vollständig vorab** angelegt.
Keine Gruppe importiert aus dem `features/`-Verzeichnis der anderen.

### 5.1 Wurzel `[GERÜST]`

```
.bun-version                    "1.4.0"
.env.example                    kommentierte Vorlage; .env selbst ist gitignored
.gitignore                      node_modules/ dist/ data/ *.db *.db-* *.sqlite* .env .env.* !.env.example …
package.json                    Root-Workspace: workspaces ["apps/*","packages/*"], alle Skripte
tsconfig.json                   Basis, "files": [], KEIN baseUrl, paths auf @toon/shared
README.md                       Setup, Stack-Tabelle, Smoke-Test per curl
CLAUDE.md                       Kontext für künftige Sessions (separat, siehe Repo-Wurzel)
Dockerfile                      vier Stages, single-origin, drei node_modules-Pfade
docker-compose.yml              app + caddy + mailpit, name: toon-finance
docker/Caddyfile                TLS-Terminierung, X-Forwarded-For-Overwrite, keine CSP
docker/entrypoint.sh            set -eu; Migrationen vor dem Start; SKIP_MIGRATIONS=1 als Notausgang
docker/env.example              Compose-Variablen inkl. SESSION_SECRET-Pflichtprüfung
scripts/dev.ts                  spawnt api+web parallel, killt beide bei SIGINT/SIGTERM
scripts/typecheck.ts            tsc sequenziell in shared, api, web; exit 1 bei Fehler
.github/workflows/ci.yml        install · typecheck · test · build · PWA-Output-Assert · Docker-Build (PR)
.github/workflows/release.yml   Image nach GHCR
```

### 5.2 `packages/shared/src`

```
index.ts                        [SHARED]    Barrel: re-exportiert money, ledger, period, plan, categories, tags, schemas/*, i18n/*
money.ts                        [SHARED]    halfForOther · halfForPayer · divRoundHalfAwayFromZero · parseGermanAmount · formatCents · CENTS_PER_EURO
ledger.ts                       [SHARED]    SplitMode · TxKind · projectKind · kindToStorage · deltaForTransaction · computeBalance · computeBreakdown · isExpense
period.ts                       [SHARED]    Period-Typ · currentPeriod · nextPeriod · previousPeriod · periodsInclusive · periodOf(ms) · periodStartMs · comparePeriods · isPeriod
plan.ts                         [SHARED]    PlanComputation · computePlanForPeriod · activeItemsIn · incomeIn · formatQuote
categories.ts                   [SHARED]    DEFAULT_CATEGORY_SLUGS (21, in Anzeigereihenfolge) · SYSTEM_CATEGORY_SLUG · isSystemCategory
tags.ts                         [SHARED]    normalizeTagName · TAG_MAX_LENGTH · SAMMELBUCHUNG_TAG
# (KEIN import/*.ts hier — die vier Parser liegen tatsächlich unter apps/api/scripts/import/, §8.2 #16)
schemas/common.ts               [SHARED]    ERROR_CODES · ApiErrorSchema · listResponse() · PaginationQuerySchema · MailDeliverySchema · CentsSchema · PeriodSchema
schemas/health.ts               [SHARED]    HealthResponseSchema
schemas/auth.ts                 [SHARED]    PasswordSchema · Register/Login/UpdateProfile/ChangePassword/Forgot/Reset · User/Me/AuthSession/SessionList
schemas/households.ts           [SHARED]    CreateHousehold/UpdateHousehold/UpdateMember/CreateInvite/AcceptInvite + alle Responses
schemas/transactions.ts         [SHARED]    TxKindSchema · TransactionListQuery · Create/UpdateTransaction · Transaction/List/Summary-Responses
schemas/categories.ts           [SHARED]    Create/UpdateCategory · Category/List-Responses
schemas/tags.ts                 [SHARED]    UpdateTag · Tag/List-Responses
schemas/plan.ts                 [SHARED]    UpdatePlan · Create/UpdateFixedCostItem · Create/UpdateIncome · Plan/Computation/Run/Recalculate-Responses
schemas/balance.ts              [SHARED]    Balance/BalanceHistory-Responses
schemas/settlements.ts          [SHARED]    CreateSettlement · SettlementResponse
i18n/locale.ts                  [SHARED]    LOCALES · Locale · DEFAULT_LOCALE="de" · INTL_LOCALE · isLocale · negotiateLocale
i18n/types.ts                   [SHARED]    CatalogEntry · PluralForms · NamespaceCatalog<P> · LocaleCatalog<C> · Placeholders<S> · TranslateArgs · Translator
i18n/translate.ts               [SHARED]    interpolate · pluralRulesFor · createTranslator · hasKey · resolveCatalogKey
i18n/zod.ts                     [SHARED]    refineKey · resolveZodIssue · toValidationIssues
i18n/catalogs/index.ts          [SHARED]    SERVER_CATALOGS · ServerKey · resolveWireKey · serverText
i18n/catalogs/server.de.ts      [SHARED]    QUELLE: server.error.* + server.zod.* + server.mail.* + server.content.*
i18n/catalogs/server.en.ts      [SHARED]    LocaleCatalog<ServerCatalog>
```

```
packages/shared/test/
  fixtures/haushalt-xlsx.ts     [SHARED]    alle Zahlen aus Haushalt.xlsx an EINER Stelle
  money.test.ts                 [SHARED]
  ledger.test.ts                [SHARED]
  period.test.ts                [SHARED]
  plan.test.ts                  [SHARED]
  tags.test.ts                  [SHARED]
  i18n.test.ts                  [SHARED]
  schemas.test.ts               [SHARED]
  # (KEINE import-*.test.ts hier — die Parser-Tests liegen alle zusammen in
  #  apps/api/test/import-haushalt.test.ts, §8.2 #16)
packages/shared/package.json    [GERÜST]    kein Build-Step, main = ./src/index.ts
packages/shared/tsconfig.json   [GERÜST]    types ["bun"], include src/**, test/**
```

### 5.3 `apps/api/src`

```
index.ts                        [API-KERN]  Hono-Bootstrap; Reihenfolge ist der Inhalt (§5.3.1)
env.ts                          [API-KERN]  zod-EnvSchema, lädt die Root-.env selbst, exit(1) mit Liste
db/schema.ts                    [API-KERN]  das vollständige Schema aus §2
db/client.ts                    [API-KERN]  createDatabase · LOCAL_FILE_PRAGMAS (synchronous = FULL!) · db · dbReady
db/migrate.ts                   [API-KERN]  MIGRATIONS_FOLDER (cwd-unabhängig) · runMigrations
drizzle.config.ts               [API-KERN]  dialect "turso", schema/out-Pfade
lib/errors.ts                   [API-KERN]  ApiError + Statik-Konstruktoren · toApiError · onErrorHandler · notFoundHandler
lib/http.ts                     [API-KERN]  json · created · noContent · toIso · toIsoOrNull · parseCsvParam
lib/types.ts                    [API-KERN]  AppEnv · AppVariables (user, sessionId, household, locale) · requireUser · requireHousehold(c)
lib/cookies.ts                  [API-KERN]  SESSION_COOKIE · TTL · set/read/clearSessionCookie
lib/locale.ts                   [API-KERN]  localeMiddleware · requestLocale(c)
lib/validation.ts               [API-KERN]  onValidationError-Hook für zValidator
lib/clock.ts                    [API-KERN]  nowMs() · setClockForTest() — der Seam für zeitabhängige Plan-Tests
middleware/session.ts           [API-KERN]  loadSession · requireSession (Doppelsignatur) · optionalSession
middleware/household.ts         [API-KERN]  requireHousehold() — 401/404/403 in EINER Query, setzt { householdId, userId, memberSlot }
middleware/staticWeb.ts         [API-KERN]  webAppMiddleware(distDir) — SPA-Fallback, Cache-Regeln, CONTENT_TYPES
routes/auth.ts                  [API-DOMÄNE]
routes/households.ts            [API-DOMÄNE]  invites-Routen VOR /:householdId
routes/transactions.ts          [API-DOMÄNE]  /summary VOR /:transactionId
routes/categories.ts            [API-DOMÄNE]
routes/tags.ts                  [API-DOMÄNE]
routes/plan.ts                  [API-DOMÄNE]
routes/balance.ts               [API-DOMÄNE]
routes/settlements.ts           [API-DOMÄNE]
services/support.ts             [API-KERN]  Tx · DbLike · transactionsSupported · withTransaction
services/auth/sessions.ts       [API-DOMÄNE]  generateSessionId · sessionHandle · create/resolve/delete · sweep · list
services/auth/passwords.ts      [API-DOMÄNE]  hashPassword · verifyPassword (Dummy-Hash gegen Timing)
services/auth/rateLimit.ts      [API-DOMÄNE]  Sliding-Window-Map, benannte Regeln, unter Test deaktiviert
services/auth/users.service.ts  [API-DOMÄNE]  findUserByEmail · createUser · updateProfile
services/auth/passwordReset.ts  [API-DOMÄNE]  Token minten/hashen/einlösen, alle Sessions löschen
services/auth/invites.ts        [API-DOMÄNE]  generateInviteToken · loadRedeemableInvite · acceptInvite (household_full)
services/households/households.service.ts [API-DOMÄNE]  anlegen + seeden (Kategorien, Plan-Zeile)
services/households/members.service.ts    [API-DOMÄNE]  Slots vergeben, Austritt prüfen
services/ledger/transactions.service.ts   [API-DOMÄNE]  CRUD, kindToStorage, Tag-Sync, replace-all-when-present
services/ledger/balance.service.ts        [API-DOMÄNE]  Saldo + breakdown aus EINER Query
services/ledger/summary.service.ts        [API-DOMÄNE]  byCategory · byMonth · Settlement-Ausschluss
services/ledger/settlements.service.ts    [API-DOMÄNE]  expectedBalanceCents-Prüfung, Zahler aus dem Vorzeichen
services/ledger/idempotency.ts            [API-DOMÄNE]  claimMutation (INSERT + onConflictDoNothing) · pruneMutationClaims
services/categories/categories.service.ts [API-DOMÄNE]  CRUD, Label-Rendering, reassignTo
services/categories/defaults.ts           [API-DOMÄNE]  die 21 Default-Slugs mit Position, für den Seed
services/tags/tags.service.ts             [API-DOMÄNE]  upsertByNameKey · syncTransactionTags · usageCount
services/plan/plan.service.ts             [API-DOMÄNE]  Lesen/Schreiben von Plan, Items, Incomes; plan_incomplete
services/plan/accrual.service.ts          [API-DOMÄNE]  runCatchUp · bookPeriod · recalculate (dryRun/apply) · accrual_runs
services/plan/scheduler.ts                [API-DOMÄNE]  Boot-Lauf + 6-Stunden-Intervall, nie unter Test
services/mail/index.ts          [API-DOMÄNE]  Mailer-Interface · getMailer · setMailer (Seam) · trySendMail · mailDeliveryOf · redactAddress
services/mail/console.ts        [API-DOMÄNE]  konfigurationsfreier Default
services/mail/smtp.ts           [API-DOMÄNE]  dependency-frei über node:net / node:tls
services/mail/templates.ts      [API-DOMÄNE]  Einladung + Passwort-Reset, gerendert in users.locale
scripts/migrate.ts              [API-KERN]
scripts/seed.ts                 [API-KERN]   Demo-Haushalt für die lokale Entwicklung
scripts/reset-password.ts       [API-KERN]   Operator-Notausgang ohne Mailer
scripts/plan-run.ts             [API-DOMÄNE] Catch-up von Hand, für Ops
scripts/import-xlsx.ts          [IMPORT]     das EINMALIGE CLI-Skript (<path> --household --dry-run --excel-text-quirk); tatsächlicher Name/Ort weicht von §8.2 #16 ab
scripts/import/xlsx-reader.ts   [IMPORT]     minimaler ZIP+XML-Leser: sharedStrings, sheet1, Zellen als (t, v, f) — statt lib/xlsx.ts, §8.2 #16
scripts/import/amounts.ts       [IMPORT]     parseAmountCell (Zahl/Formel-Cache/Text mit Dezimalkomma) — statt packages/shared/src/import/, §8.2 #16
scripts/import/dates.ts         [IMPORT]     R1..R7, Zwei-Pass-Auflösung, DateSource, MOVE_IN_DATE
scripts/import/categorize.ts    [IMPORT]     CATEGORY_RULES (20 geordnete Regeln) · categorize
scripts/import/rent.ts          [IMPORT]     RENT_SERIES (14 Paare) · expandRentSeries · RENT_SERIES_START
```

```
apps/api/test/
  smoke.test.ts                 [API-KERN]    das erklärte Template: eigene isolierte DB
  auth.test.ts                  [API-DOMÄNE]
  households.test.ts            [API-DOMÄNE]
  invites.test.ts               [API-DOMÄNE]
  transactions.test.ts          [API-DOMÄNE]
  categories.test.ts            [API-DOMÄNE]
  tags.test.ts                  [API-DOMÄNE]
  plan.test.ts                  [API-DOMÄNE]
  balance.test.ts               [API-DOMÄNE]
  settlements.test.ts           [API-DOMÄNE]
  idempotency.test.ts           [OFFLINE]
  import-haushalt.test.ts       [IMPORT]
  support/harness.ts            [API-KERN]    createUser · createHousehold · call() über app.request
apps/api/package.json           [GERÜST]
apps/api/tsconfig.json          [GERÜST]      include src/**, scripts/**, test/** (NIEMALS tests/), drizzle.config.ts
```

**§5.3.1 — die Mount-Reihenfolge in `apps/api/src/index.ts` ist verbindlich:**

```
onError · notFound · logger(!test) · localeMiddleware · /api/health
/api/auth
/api/households                                  (invites-Routen VOR /:householdId)
/api/households/:householdId/transactions
/api/households/:householdId/categories
/api/households/:householdId/tags
/api/households/:householdId/plan
/api/households/:householdId/balance
/api/households/:householdId/settlements
webAppMiddleware(WEB_DIST_DIR)                   ← GANZ zuletzt, besitzt den SPA-Fallback
```

Es gibt **keinen** `cors()`-Aufruf: single-origin. Der Server-Export ist ein Bun-Serve-Objekt
(`export default { port, fetch: app.fetch }`), kein `Bun.serve()`-Aufruf, damit `bun test` dieselbe
`app` per `app.request(path)` ohne Port benutzen kann. `localeMiddleware` läuft vor jedem Router; das
`?? env.defaultLocale` in `requestLocale(c)` bleibt trotzdem, weil `onError` davor feuern kann.

### 5.4 `apps/web/src`

```
main.tsx                        [WEB-KERN]  applyTheme · initLocale · registerServiceWorker · createRoot
app.tsx                         [WEB-KERN]  ErrorBoundary > PersistQueryClientProvider > I18nProvider > ToastProvider > RouterProvider
router.tsx                      [WEB-KERN]  der vollständige Route-Baum aus §4.2, TX_FILTER_PARAMS, lazyPage-Kandidaten
styles/index.css                [WEB-KERN]  Tailwind-Import, .px-gutter, .pb-tabbar, .bottom-tabbar, @custom-variant dark
styles/theme.css                [WEB-KERN]  semantische Farb-Tokens, hell und dunkel
lib/api.ts                      [WEB-KERN]  der EINZIGE Ort mit fetch(); eine Funktion pro Endpunkt, ALLE Bereiche
lib/queries.ts                  [WEB-KERN]  queryKeys · queryOptions · invalidate.* · STALE_TIME · shouldRetry — ALLE Features
lib/query-client.ts             [WEB-KERN]  createQueryClient + Modul-Singleton
lib/session.tsx                 [WEB-KERN]  SessionProvider · useSession · useCurrentUser · useHousehold · useOtherMember · RequireAuth · RequireHousehold · useLogin/useRegister/useLogout
lib/lazy-page.tsx               [WEB-KERN]  import.meta.glob, PageSpec mit Katalog-KEYS, MissingPage-Platzhalter
lib/storage.ts                  [WEB-KERN]  storageKeys · readStorage · writeStorage (try/catch für Private Mode)
lib/theme.ts                    [WEB-KERN]  ThemePreference · readThemePreference · applyTheme · useTheme
lib/format.ts                   [WEB-KERN]  formatCurrency(cents, locale) · formatDate · formatPeriod · formatPercent(num, den)
lib/validation.ts               [WEB-KERN]  zodFieldErrors · validate · apiFieldErrors (gibt {} für nullish!)
lib/navigation.ts               [WEB-KERN]  safeNextPath
lib/cn.ts                       [WEB-KERN]  clsx-Wrapper
lib/persist.ts                  [OFFLINE]   IndexedDB-Persister, Namensraum pro User-Id, PERSIST_BUSTER, Allow-Lists
lib/pwa.ts                      [OFFLINE]   registerServiceWorker · Update-Policy · useInstallPrompt · useOnlineStatus
lib/unsavedWork.ts              [OFFLINE]   Zähler, kein Boolean; hasUnsavedWork · claimUnsavedWork · useUnsavedWork
lib/i18n/store.ts               [WEB-KERN]  getLocale · subscribeLocale · initLocale · setLocalePreference · translate() · setLocaleForTest
lib/i18n/I18nProvider.tsx       [WEB-KERN]  useT · useLocale · useLocalePreference
lib/i18n/locale.ts              [WEB-KERN]  LocalePreference · resolveDeviceLocale · applyDocumentLocale
lib/i18n/catalogs/index.ts      [WEB-KERN]  Merge aller Namensräume, CATALOGS, MessageKey
lib/i18n/catalogs/common.de.ts  [WEB-KERN]  … und .en.ts
lib/i18n/catalogs/auth.de.ts    [WEB-KERN]  … und .en.ts
lib/i18n/catalogs/nav.de.ts     [WEB-KERN]  … und .en.ts
lib/i18n/catalogs/transactions.de.ts [WEB-KERN]  … und .en.ts
lib/i18n/catalogs/categories.de.ts   [WEB-KERN]  … und .en.ts
lib/i18n/catalogs/plan.de.ts    [WEB-KERN]  … und .en.ts
lib/i18n/catalogs/balance.de.ts [WEB-KERN]  … und .en.ts
lib/i18n/catalogs/settings.de.ts[WEB-KERN]  … und .en.ts
components/ui/index.ts          [WEB-KERN]  Barrel; **tatsächlich** genutzt wird per Tiefimport
                                 (`from "@/components/ui/Button"`), nicht über dieses Barrel — siehe
                                 §8.2 #17. Die Regel, die zählt: NIE eine zweite Implementierung
                                 eines Primitives, gleich über welchen Pfad importiert.
components/ui/ActionMenu.tsx    [WEB-KERN]
components/ui/Badge.tsx         [WEB-KERN]
components/ui/Button.tsx        [WEB-KERN]  + buttonClasses
components/ui/Card.tsx          [WEB-KERN]  + CardHeader
components/ui/ConfirmDialog.tsx [WEB-KERN]
components/ui/Dialog.tsx        [WEB-KERN]  inkl. Bottom-Sheet-Variante
components/ui/EmptyState.tsx    [WEB-KERN]
components/ui/ErrorState.tsx    [WEB-KERN]
components/ui/Field.tsx         [WEB-KERN]
components/ui/IconButton.tsx    [WEB-KERN]
components/ui/Input.tsx         [WEB-KERN]  + PasswordInput + controlClasses (min-w-0!)
components/ui/Label.tsx         [WEB-KERN]
components/ui/Select.tsx        [WEB-KERN]
components/ui/Skeleton.tsx      [WEB-KERN]  + SkeletonList
components/ui/Spinner.tsx       [WEB-KERN]  + LoadingBlock + FullPageLoader
components/ui/Switch.tsx        [WEB-KERN]
components/ui/Tabs.tsx          [WEB-KERN]
components/ui/Textarea.tsx      [WEB-KERN]
components/ui/Toast.tsx         [WEB-KERN]  ToastProvider + useToast
components/layout/AppShell.tsx  [WEB-KERN]  + PageHeader
components/layout/TopBar.tsx    [WEB-KERN]
components/layout/BottomTabBar.tsx [WEB-KERN]
components/layout/SideNav.tsx   [WEB-KERN]
components/layout/nav-items.ts  [WEB-KERN]  NAV_ITEMS + SECONDARY_NAV_ITEMS aus §4.1
components/layout/OfflineBanner.tsx [WEB-KERN]
components/layout/UpdateBanner.tsx  [OFFLINE]
components/layout/InstallPrompt.tsx [OFFLINE]
components/layout/ErrorBoundary.tsx [WEB-KERN]
components/money/AmountText.tsx [WEB-KERN]  Vorzeichenfarbe, tabular-nums, formatCurrency — von BEIDEN Feature-Gruppen benutzt
components/money/KindBadge.tsx  [WEB-KERN]  Art oder Herkunft als Badge, Label über TX_KIND_LABEL_KEYS
components/money/PeriodLabel.tsx[WEB-KERN]  'YYYY-MM' → "August 2026"
features/auth/LoginPage.tsx     [WEB-KERN]
features/auth/RegisterPage.tsx  [WEB-KERN]
features/auth/ForgotPasswordPage.tsx [WEB-KERN]
features/auth/ResetPasswordPage.tsx  [WEB-KERN]
features/auth/InvitePage.tsx    [WEB-KERN]
features/auth/lib/queries.ts    [WEB-KERN]
features/settings/SettingsPage.tsx           [WEB-KERN]
features/settings/components/ProfileCard.tsx [WEB-KERN]
features/settings/components/PasswordCard.tsx[WEB-KERN]
features/settings/components/HouseholdCard.tsx [WEB-KERN]  der einzige mobile Weg zu /household
features/settings/components/LanguageCard.tsx  [WEB-KERN]
features/settings/components/ThemeCard.tsx     [WEB-KERN]
features/settings/components/SessionsCard.tsx  [WEB-KERN]
features/settings/components/AboutCard.tsx     [WEB-KERN]
features/household/HouseholdPage.tsx           [WEB-KERN]
features/household/components/MemberList.tsx   [WEB-KERN]
features/household/components/InviteCard.tsx   [WEB-KERN]
features/household/lib/queries.ts              [WEB-KERN]
features/transactions/TransactionsPage.tsx           [WEB-TX]
features/transactions/TransactionDetailPage.tsx      [WEB-TX]
features/transactions/NewTransactionPage.tsx         [WEB-TX]
features/transactions/EditTransactionPage.tsx        [WEB-TX]
features/transactions/components/TransactionList.tsx [WEB-TX]  Tagesgruppierung, klebrige Datumsköpfe
features/transactions/components/TransactionRow.tsx  [WEB-TX]
features/transactions/components/TransactionFilters.tsx [WEB-TX]
features/transactions/components/TransactionFormFields.tsx [WEB-TX]  von New+Edit geteilt
features/transactions/components/AmountInput.tsx     [WEB-TX]  parseGermanAmount, Vorzeichen-Toggle
features/transactions/components/KindPicker.tsx      [WEB-TX]  das 2×2-Raster
features/transactions/components/CategorySheet.tsx   [WEB-TX]
features/transactions/components/TagInput.tsx        [WEB-TX]
features/transactions/lib/queries.ts                 [WEB-TX]  Feature-Hooks (nur mutationKey, keine mutationFn)
features/transactions/lib/kinds.ts                   [WEB-TX]  TX_KIND_LABEL_KEYS · TX_KIND_ICONS · kindExplainer
features/transactions/lib/offline.ts                 [OFFLINE] TX_MUTATION_KEYS · registerTransactionMutationDefaults · optimistische Cache-Patches
features/overview/OverviewPage.tsx                   [WEB-SALDO]
features/overview/components/BalanceHero.tsx         [WEB-SALDO]
features/overview/components/SettleDialog.tsx        [WEB-SALDO]  expectedBalanceCents, balance_stale-Behandlung
features/overview/components/FixedCostCard.tsx       [WEB-SALDO]  mobiler Zugang zu /plan
features/overview/components/MonthSummaryCard.tsx    [WEB-SALDO]
features/overview/components/SpendByCategoryCard.tsx [WEB-SALDO] mobiler Zugang zu /categories
features/overview/components/RecentTransactionsCard.tsx [WEB-SALDO]
features/overview/lib/queries.ts                     [WEB-SALDO]
features/plan/PlanPage.tsx                           [WEB-SALDO]
features/plan/components/PlanSummary.tsx             [WEB-SALDO]
features/plan/components/FixedCostItemList.tsx       [WEB-SALDO]
features/plan/components/IncomeList.tsx              [WEB-SALDO]
features/plan/components/PlanPeriodList.tsx          [WEB-SALDO]
features/plan/components/RecalculateDialog.tsx       [WEB-SALDO]
features/plan/lib/queries.ts                         [WEB-SALDO]
features/categories/CategoriesPage.tsx               [WEB-SALDO]
features/categories/components/CategoryRow.tsx       [WEB-SALDO]
features/categories/components/DeleteCategoryDialog.tsx [WEB-SALDO]
features/categories/lib/queries.ts                   [WEB-SALDO]
lib/persist.test.ts             [OFFLINE]
lib/validation.test.ts          [WEB-KERN]
lib/format.test.ts              [WEB-KERN]
lib/unsavedWork.test.ts         [OFFLINE]
lib/i18n/i18n.test.ts           [WEB-KERN]
lib/bun-test.d.ts               [WEB-KERN]  Shim, weil apps/web types: ["vite/client"] setzt
```

```
apps/web/index.html             [GERÜST]  Inline-Theme-Skript vor dem ersten Paint, viewport-fit=cover, theme-color
apps/web/vite.config.ts         [GERÜST]  envDir "../../", envPrefix ["VITE_","PUBLIC_"], PWA (§5.4.1)
apps/web/package.json           [GERÜST]
apps/web/tsconfig.json          [GERÜST]  types ["vite/client"], jsx react-jsx, paths @toon/shared + @/*
apps/web/public/…               [GERÜST]  Icons für das Manifest
```

**§5.4.1 — der PWA-Block in `vite.config.ts` ist verbindlich:**

```ts
workbox: {
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,                    // AUS. Siehe Gotchas.
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  runtimeCaching: [
    { urlPattern: /\/api\//, handler: "NetworkOnly" },   // AUSNAHMSLOS
  ],
},
```

**`/api` gehört niemals ins `runtimeCaching` mit einem cachenden Handler.** Die Offline-Kopie des
Ledgers **ist** der persistierte TanStack-Cache — derselbe Speicher, in dem die pausierten Mutationen
liegen. Ein `NetworkFirst`-Treffer würde TanStack einen veralteten Body als frischen Erfolg
unterschieben, `onSuccess` schriebe ihn über den optimistischen Zustand, und eine gerade erfasste
Buchung wäre still wieder weg.

---

## 6. i18n-Key-Inventar

Zehn Namensräume. Acht davon (`common`, `auth`, `nav`, `transactions`, `categories`, `plan`, `balance`,
`settings`) liegen als `<ns>.de.ts` / `<ns>.en.ts` in `apps/web/src/lib/i18n/catalogs/`. Die beiden
übrigen (`errors`, `validation`) sind Server-Copy und liegen in
`packages/shared/src/i18n/catalogs/server.{de,en}.ts` unter dem gemeinsamen Präfix `server.` — die API
rendert daraus `error.message`, und die Web-App löst denselben Key über `resolveWireKey` auf.

Verbindliche Regeln:

* `de` ist die **Quelle**: `export const xDe = { … } as const satisfies NamespaceCatalog<"x">;`
  `en` ist **abgeleitet**: `export const xEn: LocaleCatalog<XCatalog> = { … };`
  Ein fehlender Key, ein überzähliger Key und ein string-vs-plural-Mismatch sind **Compile**-Fehler.
* **Die deutschen Texte unten sind final.** Die Implementierung erfindet keine Texte und formuliert
  keinen um. Wird ein Text gebraucht, der hier fehlt, wird er hier ergänzt — nicht in der Komponente.
* Ein aus einem Ternär oder über zwei JSX-Zeilen zusammengesetzter Satz wird **ein** Key.
* `{name}` ist immer der Anzeigename der **anderen** Person, `{amount}` ein fertig formatierter Betrag,
  `{period}` ein fertig formatierter Monat, `{count}` eine Zahl (Plural-Eintrag).
* Ops-Ausgabe (console.*, CLI, env-Validierung, `Error.message`) bleibt **englisches Literal** und geht
  nie durch den Katalog.

### 6.1 `common`

| Key | de |
| --- | --- |
| `common.appName` | toon-finance |
| `common.save` | Speichern |
| `common.cancel` | Abbrechen |
| `common.delete` | Löschen |
| `common.edit` | Bearbeiten |
| `common.add` | Hinzufügen |
| `common.remove` | Entfernen |
| `common.back` | Zurück |
| `common.close` | Schließen |
| `common.confirm` | Bestätigen |
| `common.retry` | Erneut versuchen |
| `common.loading` | Wird geladen … |
| `common.search` | Suchen |
| `common.searchPlaceholder` | Suchen … |
| `common.filter` | Filter |
| `common.filterReset` | Filter zurücksetzen |
| `common.showMore` | Mehr anzeigen |
| `common.showLess` | Weniger anzeigen |
| `common.loadMore` | Mehr laden |
| `common.optional` | optional |
| `common.select` | Auswählen |
| `common.none` | Keine |
| `common.all` | Alle |
| `common.yes` | Ja |
| `common.no` | Nein |
| `common.today` | Heute |
| `common.yesterday` | Gestern |
| `common.pickDate` | Datum wählen … |
| `common.thisMonth` | Dieser Monat |
| `common.lastMonth` | Letzter Monat |
| `common.thisYear` | Dieses Jahr |
| `common.allTime` | Gesamt |
| `common.from` | Von |
| `common.to` | Bis |
| `common.amount` | Betrag |
| `common.date` | Datum |
| `common.description` | Beschreibung |
| `common.category` | Kategorie |
| `common.tags` | Tags |
| `common.person` | Person |
| `common.actions` | Aktionen |
| `common.undo` | Rückgängig |
| `common.copy` | Kopieren |
| `common.copied` | Kopiert |
| `common.offline` | Offline |
| `common.offlineBanner` | Keine Verbindung. Du siehst gespeicherte Daten. |
| `common.offlineData` | Gespeicherter Stand |
| `common.syncPending` | `{ one: "1 Änderung wartet auf Übertragung.", other: "{count} Änderungen warten auf Übertragung." }` |
| `common.updateAvailable` | Eine neue Version ist bereit. |
| `common.updateApply` | Jetzt aktualisieren |
| `common.installTitle` | App installieren |
| `common.installHint` | Zum Startbildschirm hinzufügen — dann funktioniert das Erfassen auch offline. |
| `common.installAction` | Installieren |
| `common.errorTitle` | Etwas ist schiefgelaufen |
| `common.errorGeneric` | Das hat nicht geklappt. Bitte versuch es noch einmal. |
| `common.errorOffline` | Keine Verbindung zum Server. |
| `common.notFoundTitle` | Seite nicht gefunden |
| `common.notFoundAction` | Zur Übersicht |
| `common.missingPage` | Dieser Screen ist noch nicht gebaut: {path} |
| `common.unsavedWarning` | Du hast ungespeicherte Eingaben. |

### 6.2 `auth`

| Key | de |
| --- | --- |
| `auth.login.title` | Anmelden |
| `auth.login.subtitle` | Melde dich mit deiner E-Mail-Adresse an. |
| `auth.login.email` | E-Mail |
| `auth.login.password` | Passwort |
| `auth.login.submit` | Anmelden |
| `auth.login.forgot` | Passwort vergessen? |
| `auth.login.toRegister` | Noch kein Konto? Registrieren |
| `auth.login.resetDone` | Dein Passwort wurde geändert. Bitte melde dich neu an. |
| `auth.register.title` | Konto erstellen |
| `auth.register.subtitle` | Zwei Personen, eine Haushaltskasse. |
| `auth.register.name` | Name |
| `auth.register.namePlaceholder` | Wie sollen wir dich nennen? |
| `auth.register.email` | E-Mail |
| `auth.register.password` | Passwort |
| `auth.register.passwordHint` | Mindestens 10 Zeichen. |
| `auth.register.submit` | Konto erstellen |
| `auth.register.toLogin` | Du hast schon ein Konto? Anmelden |
| `auth.register.inviteHint` | Du trittst dem Haushalt „{household}" bei. |
| `auth.forgot.title` | Passwort zurücksetzen |
| `auth.forgot.subtitle` | Wir schicken dir einen Link an deine E-Mail-Adresse. |
| `auth.forgot.submit` | Link anfordern |
| `auth.forgot.done` | Wenn es zu dieser Adresse ein Konto gibt, ist der Link unterwegs. |
| `auth.reset.title` | Neues Passwort |
| `auth.reset.password` | Neues Passwort |
| `auth.reset.submit` | Passwort speichern |
| `auth.reset.invalid` | Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen an. |
| `auth.invite.title` | Einladung |
| `auth.invite.subtitle` | {name} lädt dich in den Haushalt „{household}" ein. |
| `auth.invite.acceptLoggedIn` | Beitreten |
| `auth.invite.acceptNewAccount` | Konto erstellen und beitreten |
| `auth.invite.haveAccount` | Ich habe schon ein Konto |
| `auth.invite.invalid` | Diese Einladung ist ungültig oder wurde bereits eingelöst. |
| `auth.invite.expired` | Diese Einladung ist abgelaufen. Bitte lass dir eine neue schicken. |
| `auth.invite.full` | Dieser Haushalt hat bereits zwei Mitglieder. |
| `auth.invite.alreadyMember` | Du bist bereits Mitglied dieses Haushalts. |
| `auth.logout` | Abmelden |
| `auth.displayName` | Anzeigename im Haushalt |

### 6.3 `nav`

| Key | de |
| --- | --- |
| `nav.overview` | Übersicht |
| `nav.transactions` | Buchungen |
| `nav.create` | Erfassen |
| `nav.profile` | Profil |
| `nav.plan` | Fixkosten |
| `nav.categories` | Kategorien |
| `nav.household` | Haushalt |

### 6.4 `transactions` — Liste, Detail, Formular

| Key | de |
| --- | --- |
| `transactions.title` | Buchungen |
| `transactions.empty.title` | Noch keine Buchungen |
| `transactions.empty.description` | Erfasse die erste gemeinsame Ausgabe — der Saldo rechnet sich von allein. |
| `transactions.empty.action` | Erste Buchung erfassen |
| `transactions.emptyFiltered.title` | Keine Buchung passt zu diesem Filter |
| `transactions.emptyFiltered.action` | Filter zurücksetzen |
| `transactions.count` | `{ one: "1 Buchung", other: "{count} Buchungen" }` |
| `transactions.filter.title` | Filter |
| `transactions.filter.period` | Zeitraum |
| `transactions.filter.kind` | Art |
| `transactions.filter.category` | Kategorie |
| `transactions.filter.tags` | Tags |
| `transactions.filter.origin` | Herkunft |
| `transactions.filter.onlyMine` | Nur meine |
| `transactions.filter.hideAggregates` | Sammelbuchungen ausblenden |
| `transactions.dateEstimated` | Datum geschätzt |
| `transactions.yourShare` | Dein Anteil {amount} |
| `transactions.theirShare` | Anteil {name}: {amount} |
| `transactions.paidBy` | Gezahlt von {name} |
| `transactions.paidByYou` | Von dir gezahlt |
| `transactions.origin.manual` | Manuell |
| `transactions.origin.plan` | Fixkosten |
| `transactions.origin.planAdjustment` | Korrektur |
| `transactions.origin.import` | Übernahme |
| `transactions.generatedHint` | Diese Buchung stammt aus dem Fixkostenplan und wird nicht bearbeitet. Korrekturen entstehen über die Neuberechnung. |
| `transactions.detail.title` | Buchung |
| `transactions.detail.balanceEffect` | Wirkung auf den Saldo |
| `transactions.detail.createdBy` | Erfasst von {name} |
| `transactions.detail.createdAt` | Erfasst am {date} |
| `transactions.new.title` | Buchung erfassen |
| `transactions.edit.title` | Buchung bearbeiten |
| `transactions.form.amount` | Betrag |
| `transactions.form.amountPlaceholder` | 0,00 |
| `transactions.form.amountInvalid` | Bitte gib einen Betrag ein, zum Beispiel 12,50. |
| `transactions.form.amountZero` | Null geht nicht — trag den tatsächlichen Betrag ein. |
| `transactions.form.credit` | Erstattung / Gutschrift |
| `transactions.form.creditHint` | Der Betrag wird negativ gebucht und verringert die Schuld. |
| `transactions.form.kind` | Art |
| `transactions.form.description` | Beschreibung |
| `transactions.form.descriptionPlaceholder` | Wofür war das? |
| `transactions.form.descriptionRequired` | Bitte beschreib die Buchung kurz. |
| `transactions.form.moreDetails` | Mehr Details |
| `transactions.form.category` | Kategorie |
| `transactions.form.categoryNone` | Ohne Kategorie |
| `transactions.form.categorySearch` | Kategorie suchen |
| `transactions.form.tags` | Tags |
| `transactions.form.tagsPlaceholder` | Tag eingeben und Enter drücken |
| `transactions.form.tagsSuggestions` | Häufig benutzt |
| `transactions.form.date` | Datum |
| `transactions.form.submitCreate` | Buchen |
| `transactions.form.submitEdit` | Speichern |
| `transactions.deleteConfirm.title` | Buchung löschen? |
| `transactions.deleteConfirm.body` | „{description}" über {amount} wird entfernt. Der Saldo ändert sich sofort. |
| `transactions.toast.created` | Gebucht. |
| `transactions.toast.queued` | Gespeichert. Wird übertragen, sobald du online bist. |
| `transactions.toast.updated` | Änderung gespeichert. |
| `transactions.toast.deleted` | Buchung gelöscht. |

### 6.5 `transactions` — die vier Arten (Kacheltexte des Erfassen-Flows)

| Key | de |
| --- | --- |
| `transactions.kind.mineSplit.label` | Geteilt — ich |
| `transactions.kind.mineSplit.hint` | Ich habe gezahlt, wir teilen 50/50. |
| `transactions.kind.mineSplit.effect` | Ihr teilt {amount} — {name} trägt {share}. |
| `transactions.kind.theirsSplit.label` | Geteilt — {name} |
| `transactions.kind.theirsSplit.hint` | {name} hat gezahlt, wir teilen 50/50. |
| `transactions.kind.theirsSplit.effect` | Ihr teilt {amount} — du trägst {share}. |
| `transactions.kind.forThem.label` | Für {name} |
| `transactions.kind.forThem.hint` | Ich habe gezahlt, gehört zu 100 % {name}. |
| `transactions.kind.forThem.effect` | {name} schuldet dir dafür {amount}. |
| `transactions.kind.transfer.label` | Ausgleich |
| `transactions.kind.transfer.hint` | {name} hat mir Geld überwiesen. |
| `transactions.kind.transfer.effect` | Der Saldo sinkt um {amount}. |

### 6.6 `categories`

| Key | de |
| --- | --- |
| `categories.title` | Kategorien |
| `categories.description` | Kategorien ordnen eure Ausgaben. Tags sind für alles, was feiner ist. |
| `categories.manage` | Kategorien verwalten |
| `categories.add` | Kategorie hinzufügen |
| `categories.label` | Bezeichnung |
| `categories.system` | System |
| `categories.systemHint` | Diese Kategorie gehört dem Fixkostenplan und lässt sich nicht ändern. |
| `categories.hidden` | Ausgeblendet |
| `categories.hide` | Ausblenden |
| `categories.show` | Einblenden |
| `categories.usage` | `{ one: "1 Buchung", other: "{count} Buchungen" }` |
| `categories.renameHint` | Nach dem Umbenennen wechselt diese Kategorie nicht mehr mit der Sprache der Oberfläche. |
| `categories.delete.title` | Kategorie löschen? |
| `categories.delete.reassign` | Buchungen umhängen auf |
| `categories.delete.inUse` | An dieser Kategorie hängen {count} Buchungen. Wähl eine Zielkategorie. |
| `categories.toast.created` | Kategorie angelegt. |
| `categories.toast.updated` | Kategorie gespeichert. |
| `categories.toast.deleted` | Kategorie gelöscht. |
| `categories.name.tiere` | Tiere |
| `categories.name.miete` | Miete |
| `categories.name.nebenkosten` | Nebenkosten |
| `categories.name.fixkosten` | Fixkosten |
| `categories.name.versicherung` | Versicherungen |
| `categories.name.steuern_abgaben` | Steuern & Abgaben |
| `categories.name.baumarkt` | Baumarkt & Renovierung |
| `categories.name.moebel_wohnen` | Möbel & Wohnen |
| `categories.name.elektronik` | Elektronik |
| `categories.name.lebensmittel` | Lebensmittel |
| `categories.name.haushalt_kueche` | Haushalt & Küche |
| `categories.name.drogerie` | Drogerie & Pflege |
| `categories.name.kleidung` | Kleidung & Accessoires |
| `categories.name.spiele_medien` | Spiele & Medien |
| `categories.name.hobby_kreativ` | Hobby & Kreativ |
| `categories.name.mobilitaet` | Mobilität |
| `categories.name.reisen` | Reisen |
| `categories.name.freizeit` | Freizeit & Ausgehen |
| `categories.name.geschenke` | Geschenke & Spenden |
| `categories.name.ausgleich` | Ausgleich & Rückzahlung |
| `categories.name.sonstiges` | Sonstiges |

Die englischen Entsprechungen stehen in `docs/ledger-spec.md` §7.1 und werden von dort wörtlich nach
`categories.en.ts` übernommen.

### 6.7 `plan`

| Key | de |
| --- | --- |
| `plan.title` | Fixkostenplan |
| `plan.description` | Aus euren Einkommen und den festen Kosten wird jeden Monat automatisch der Anteil von {name} gebucht. |
| `plan.enabled` | Plan aktiv |
| `plan.disabledHint` | Der Fixkostenplan ist aus. Trag Fixkosten und Einkommen ein, dann kann er buchen. |
| `plan.setup` | Fixkosten einrichten |
| `plan.payer` | Wer zahlt die Fixkosten? |
| `plan.startPeriod` | Erste Buchung ab |
| `plan.costTotal` | Fixkosten gesamt |
| `plan.incomeTotal` | Einkommen gesamt |
| `plan.quote` | Quote |
| `plan.quoteHint` | {cost} von {income} — {percent} des gemeinsamen Einkommens. |
| `plan.shareOther` | {name} zahlt |
| `plan.sharePayer` | {name} trägt |
| `plan.sharePayerYou` | Du trägst |
| `plan.monthly` | Monatsanteil |
| `plan.nextBooking` | Nächste Buchung: {period} |
| `plan.lastBooked` | Zuletzt gebucht: {period} |
| `plan.pendingNotice` | `{ one: "1 Monat ist noch nicht gebucht.", other: "{count} Monate sind noch nicht gebucht." }` |
| `plan.run` | Jetzt buchen |
| `plan.toast.run` | `{ one: "1 Monat gebucht.", other: "{count} Monate gebucht." }` |
| `plan.toast.nothingToDo` | Alles bereits gebucht. |
| `plan.items.title` | Fixkosten |
| `plan.items.add` | Position hinzufügen |
| `plan.items.label` | Bezeichnung |
| `plan.items.amount` | Betrag pro Monat |
| `plan.items.activeFrom` | Gültig ab |
| `plan.items.activeTo` | Gültig bis |
| `plan.items.open` | offen |
| `plan.items.validity` | {from} bis {to} |
| `plan.items.validityOpen` | ab {from} |
| `plan.items.supersedeHint` | Betrag geändert? Beende die alte Position und leg eine neue an — so bleibt jeder Monat nachvollziehbar. |
| `plan.items.supersede` | Alte Position beenden und neue anlegen |
| `plan.items.empty` | Noch keine Fixkosten eingetragen. |
| `plan.incomes.title` | Einkommen |
| `plan.incomes.add` | Einkommen hinzufügen |
| `plan.incomes.person` | Person |
| `plan.incomes.amount` | Netto pro Monat |
| `plan.incomes.validFrom` | Gültig ab |
| `plan.incomes.validTo` | Gültig bis |
| `plan.incomes.empty` | Für mindestens eine Person fehlt das Einkommen. |
| `plan.periods.title` | Gebuchte Monate |
| `plan.periods.pending` | offen |
| `plan.periods.empty` | Noch nichts gebucht. |
| `plan.recalculate.title` | Neuberechnung |
| `plan.recalculate.description` | Prüft alle gebuchten Monate gegen die heutigen Daten. Gebuchte Monate werden nie geändert — Abweichungen entstehen als Korrekturbuchung. |
| `plan.recalculate.preview` | Vorschau berechnen |
| `plan.recalculate.period` | Monat |
| `plan.recalculate.booked` | gebucht |
| `plan.recalculate.recomputed` | neu berechnet |
| `plan.recalculate.delta` | Differenz |
| `plan.recalculate.total` | Summe der Korrekturen |
| `plan.recalculate.confirm` | Korrekturen buchen |
| `plan.recalculate.none` | Keine Abweichung. Alle gebuchten Monate stimmen. |
| `plan.recalculate.done` | `{ one: "1 Korrektur gebucht.", other: "{count} Korrekturen gebucht." }` |
| `plan.lastRun` | Letzter Lauf: {date} |
| `plan.lastRunResult` | {booked} gebucht, {skipped} übersprungen |
| `plan.error.incomplete` | Für diese Berechnung fehlen Angaben: mindestens eine Fixkostenposition und für beide Personen ein Einkommen. |
| `plan.error.disabled` | Der Fixkostenplan ist nicht aktiv. |
| `plan.bookingDescription` | Fixkostenanteil {period} |
| `plan.adjustmentDescription` | Korrektur Fixkostenanteil {period} |

`plan.bookingDescription` und `plan.adjustmentDescription` sind die einzigen Katalogtexte, die der
**Server** in eine Datenzeile schreibt. Sie werden in `households.defaultLocale` gerendert und danach
als schlichter Inhalt behandelt — beim Lesen nie neu übersetzt.

### 6.8 `balance`

| Key | de |
| --- | --- |
| `balance.title` | Saldo |
| `balance.owesYou` | {name} schuldet dir {amount} |
| `balance.youOwe` | Du schuldest {name} {amount} |
| `balance.settled` | Ausgeglichen |
| `balance.asOf` | Stand {date} |
| `balance.details` | Details |
| `balance.breakdown.title` | Woraus der Saldo besteht |
| `balance.breakdown.split` | Geteilte Ausgaben |
| `balance.breakdown.forOther` | Für {name} bezahlt |
| `balance.breakdown.settled` | Bereits ausgeglichen |
| `balance.breakdown.count` | `{ one: "aus 1 Buchung", other: "aus {count} Buchungen" }` |
| `balance.settle.action` | Jetzt ausgleichen |
| `balance.settle.title` | Ausgleichszahlung |
| `balance.settle.full` | Vollständig ausgleichen ({amount}) |
| `balance.settle.partial` | Anderer Betrag |
| `balance.settle.amount` | Betrag |
| `balance.settle.direction` | {from} zahlt an {to} |
| `balance.settle.note` | Notiz |
| `balance.settle.notePlaceholder` | z. B. Überweisung vom 09.08. |
| `balance.settle.submit` | Ausgleich buchen |
| `balance.settle.overpayHint` | Mehr als der Saldo — danach schuldet {name} dir Geld. |
| `balance.settle.stale` | Der Saldo hat sich gerade geändert. Er steht jetzt bei {amount}. |
| `balance.settle.staleAction` | Neu laden und weiter |
| `balance.settle.done` | Ausgleich gebucht. |
| `balance.month.title` | Dieser Monat |
| `balance.month.total` | Ausgaben |
| `balance.month.delta` | {amount} gegenüber dem Vormonat |
| `balance.month.count` | `{ one: "1 Buchung", other: "{count} Buchungen" }` |
| `balance.byCategory.title` | Ausgaben nach Kategorie |
| `balance.byCategory.other` | Sonstige |
| `balance.byCategory.none` | Ohne Kategorie |
| `balance.byCategory.empty` | In diesem Zeitraum gibt es keine Ausgaben. |
| `balance.recent.title` | Zuletzt erfasst |
| `balance.recent.all` | Alle Buchungen |
| `balance.history.title` | Verlauf |
| `balance.history.hideAggregates` | Sammelbuchungen ausblenden |

### 6.9 `settings`

| Key | de |
| --- | --- |
| `settings.title` | Profil |
| `settings.profile.title` | Dein Konto |
| `settings.profile.name` | Name |
| `settings.profile.email` | E-Mail |
| `settings.profile.saved` | Gespeichert. |
| `settings.password.title` | Passwort ändern |
| `settings.password.current` | Aktuelles Passwort |
| `settings.password.new` | Neues Passwort |
| `settings.password.submit` | Passwort ändern |
| `settings.password.changed` | Passwort geändert. |
| `settings.household.title` | Haushalt |
| `settings.household.defaultName` | Unser Haushalt |
| `settings.household.name` | Name des Haushalts |
| `settings.household.manage` | Haushalt verwalten |
| `settings.household.members` | Mitglieder |
| `settings.household.you` | du |
| `settings.household.joinedAt` | dabei seit {date} |
| `settings.household.displayName` | Anzeigename |
| `settings.household.invite` | Zweite Person einladen |
| `settings.household.inviteCreate` | Einladung erstellen |
| `settings.household.inviteEmail` | E-Mail-Adresse (optional) |
| `settings.household.inviteLink` | Einladungslink |
| `settings.household.inviteLinkHint` | Der Link gilt 14 Tage. Wer ihn hat, kann beitreten. |
| `settings.household.inviteRevoke` | Einladung zurückziehen |
| `settings.household.mailSent` | Einladung per E-Mail verschickt. |
| `settings.household.mailNotConfigured` | Es ist kein Mailversand eingerichtet — gib den Link von Hand weiter. |
| `settings.household.mailFailed` | Der Versand ist fehlgeschlagen. Der Link gilt trotzdem — gib ihn von Hand weiter. |
| `settings.household.full` | Dieser Haushalt ist vollständig. Mehr als zwei Personen sind nicht vorgesehen. |
| `settings.household.leave` | Haushalt verlassen |
| `settings.household.leaveConfirm` | Wirklich verlassen? Du siehst danach keine Buchungen mehr. |
| `settings.language.title` | Sprache |
| `settings.language.system` | Systemsprache |
| `settings.language.de` | Deutsch |
| `settings.language.en` | English |
| `settings.theme.title` | Darstellung |
| `settings.theme.system` | System |
| `settings.theme.light` | Hell |
| `settings.theme.dark` | Dunkel |
| `settings.sessions.title` | Angemeldete Geräte |
| `settings.sessions.current` | Dieses Gerät |
| `settings.sessions.lastUsed` | zuletzt aktiv {date} |
| `settings.sessions.revoke` | Abmelden |
| `settings.about.title` | Über |
| `settings.about.version` | Version {version} |

`settings.language.de` und `settings.language.en` sind **Autonyme und in beiden Katalogen
byte-identisch** — wer versehentlich in eine Sprache wechselt, die er nicht liest, braucht einen Weg
zurück.

### 6.10 `errors` — `server.error.*` (packages/shared)

| Key | de |
| --- | --- |
| `server.error.badRequest` | Ungültige Anfrage |
| `server.error.unauthorized` | Bitte melde dich an. |
| `server.error.invalidCredentials` | E-Mail oder Passwort stimmt nicht. |
| `server.error.forbidden` | Dazu hast du keine Berechtigung. |
| `server.error.notFound` | Nicht gefunden |
| `server.error.routeUnknown` | Unbekannter Endpunkt: {method} {path} |
| `server.error.conflict` | Das steht im Widerspruch zum aktuellen Stand. |
| `server.error.internal` | Unerwarteter Fehler. Bitte versuch es später noch einmal. |
| `server.error.requestFailed` | Die Anfrage ist fehlgeschlagen. |
| `server.error.tooManyAttempts` | Zu viele Versuche. Bitte in {seconds} Sekunden erneut probieren. |
| `server.auth.emailTaken` | Zu dieser E-Mail-Adresse gibt es bereits ein Konto. |
| `server.auth.invalidJsonBody` | Der Anfrage-Body ist kein gültiges JSON. |
| `server.auth.passwordRequired` | Bitte gib dein aktuelles Passwort ein. |
| `server.auth.resetTokenInvalid` | Dieser Link ist ungültig oder abgelaufen. |
| `server.household.noAccess` | Dieser Haushalt gehört nicht zu deinem Konto. |
| `server.household.required` | Du gehörst noch zu keinem Haushalt. |
| `server.household.full` | Dieser Haushalt hat bereits zwei Mitglieder. |
| `server.household.memberHasLedger` | Zu dieser Person gibt es noch Buchungen. Sie müssen zuerst entfernt werden. |
| `server.invite.invalid` | Diese Einladung ist ungültig oder bereits eingelöst. |
| `server.invite.expired` | Diese Einladung ist abgelaufen. |
| `server.transaction.amountZero` | Der Betrag darf nicht 0 sein. |
| `server.transaction.generated` | Diese Buchung stammt aus dem Fixkostenplan und lässt sich nicht ändern. |
| `server.transaction.notFound` | Diese Buchung gibt es nicht. |
| `server.balance.stale` | Der Saldo hat sich geändert. Er steht jetzt bei {amount}. |
| `server.settlement.amountInvalid` | Der Ausgleichsbetrag muss größer als 0 sein. |
| `server.category.system` | Diese Kategorie gehört zum System und lässt sich nicht ändern. |
| `server.category.inUse` | An dieser Kategorie hängen noch {count} Buchungen. |
| `server.category.slugTaken` | Diese Kategorie gibt es bereits. |
| `server.tag.nameTaken` | Diesen Tag gibt es bereits. |
| `server.plan.disabled` | Der Fixkostenplan ist nicht aktiv. |
| `server.plan.incomplete` | Für die Berechnung fehlen Fixkosten oder ein Einkommen. |
| `server.plan.periodLocked` | Für diesen Monat gibt es bereits eine Buchung. |
| `server.plan.periodOutOfRange` | Dieser Monat liegt außerhalb des Planzeitraums. |
| `server.mail.inviteSubject` | Einladung in den Haushalt „{household}" |
| `server.mail.inviteBody` | {name} lädt dich ein, den Haushalt „{household}" mitzuführen. Über diesen Link trittst du bei: {url} — der Link gilt 14 Tage. |
| `server.mail.resetSubject` | Passwort zurücksetzen |
| `server.mail.resetBody` | Über diesen Link setzt du dein Passwort neu: {url} — der Link gilt eine Stunde. Wenn du das nicht angefordert hast, ignorier diese E-Mail. |

### 6.11 `validation` — `server.zod.*` (packages/shared)

Auflösung vom Spezifischen zum Allgemeinen, wie im Referenz-Repo:
`server.zod.field.<field>.<code>.<bound>` → `server.zod.field.<field>.<code>` →
`server.zod.<code>.<facet>` → `server.zod.<code>` → `server.zod.fallback`.

| Key | de |
| --- | --- |
| `server.zod.fallback` | Diese Eingabe ist ungültig. |
| `server.zod.invalid_type` | Ungültiger Wert. |
| `server.zod.invalid_type.required` | Dieses Feld ist erforderlich. |
| `server.zod.too_small.string` | Mindestens {minimum} Zeichen. |
| `server.zod.too_small.number` | Mindestens {minimum}. |
| `server.zod.too_big.string` | Höchstens {maximum} Zeichen. |
| `server.zod.too_big.number` | Höchstens {maximum}. |
| `server.zod.invalid_format.email` | Bitte gib eine gültige E-Mail-Adresse ein. |
| `server.zod.invalid_format.uuid` | Ungültige Kennung. |
| `server.zod.invalid_enum` | Ungültige Auswahl. |
| `server.zod.field.password.too_small` | Das Passwort braucht mindestens {minimum} Zeichen. |
| `server.zod.field.email.invalid_format` | Bitte gib eine gültige E-Mail-Adresse ein. |
| `server.zod.field.amountCents.invalid_type` | Bitte gib einen Betrag ein. |
| `server.zod.field.description.too_small` | Bitte beschreib die Buchung kurz. |
| `server.zod.field.description.too_big` | Die Beschreibung ist zu lang (höchstens {maximum} Zeichen). |
| `server.validation.periodFormat` | Bitte gib einen Monat im Format JJJJ-MM an. |
| `server.validation.amountNotZero` | Der Betrag darf nicht 0 sein. |
| `server.validation.amountPositive` | Der Betrag muss größer als 0 sein. |
| `server.validation.periodRange` | Das Ende darf nicht vor dem Beginn liegen. |

Schemas bleiben **i18n-frei**: Zod-Fehler werden **nach** dem Parse in Keys aufgelöst
(`resolveZodIssue`), nicht über eine Error-Map. Ein eigener Refinement-Text geht über
`refineKey("server.validation.…")`.

---

## 7. Test-Plan

Runner ist `bun test`, ein Prozess für alle Dateien, Ausführungsreihenfolge ist **Dateisystem**-Ordnung,
nicht alphabetisch. Daraus folgen zwei Regeln, die keine Ausnahme kennen: **kein `mock.module`** (es
leakt über Dateien und bun stellt es nie wieder her) — stattdessen ein expliziter Setter-Seam
(`setMailer`, `setLocaleForTest`, `setClockForTest`), den die Datei in `afterAll` zurückgibt. Und:
`TEST_DATABASE_URL` zeigt auf eine **temporäre Datei**, nicht auf `file::memory:` — sonst sieht kein
Integrationstest je eine echte Transaktion.

### 7.1 Wo Tests liegen

| Ort | Inhalt |
| --- | --- |
| `packages/shared/test/*.test.ts` | reine Fachlogik. **Hier ist der Pflichtteil.** Tabellengetrieben (`test.each`). |
| `apps/api/test/*.test.ts` | Integrationstests durch `app.request()`, ohne Port. **`test/`, niemals `tests/`** — das tsconfig inkludiert nur `test/**`. |
| `apps/web/src/**/*.test.ts` | Web-Unit-Tests **neben** dem Code; brauchen den `bun:test`-Shim, weil `apps/web` `types: ["vite/client"]` setzt. |

`packages/shared/test/fixtures/haushalt-xlsx.ts` hält **alle** Zahlen aus `Haushalt.xlsx` an einer
Stelle: die drei Spaltensummen, die Summen der Einzel-Halbierungen, die 14 Mietpaare, `K4`, die sechs
Fixkostenpositionen, die beiden Einkommen und die vier Referenzsalden. Keine dieser Zahlen darf ein
zweites Mal im Code stehen.

### 7.2 Pflicht-Tests: Ledger-Mathematik — `packages/shared/test/money.test.ts` + `ledger.test.ts`

Namentlich, mit den Vektornummern aus `docs/ledger-spec.md` §8:

| Testname | Vektoren | Prüft |
| --- | --- | --- |
| `halfForOther: table of small amounts` | 1–7 | 100/101/1/0/−100/**−101**/−1 |
| `halfForOther: the payer bears the odd cent in BOTH sign directions` | 6 | **`halfForOther(-101) === -50`, nicht `-51`** — die `Math.floor`-Falle, der wahrscheinlichste Bug dieses Repos |
| `halfForOther: real rows from the sheet` | 8–10 | `B51 = −68 451 → −34 225` · `B9 = 35 477 → 17 738` · `E4 = 16 233 → 8 116` |
| `halfForOther + halfForPayer reconstruct the total` | 11 | Property über zufällige Beträge |
| `halfForOther is odd-symmetric` | 12 | `halfForOther(−a) === −halfForOther(a)` |
| `deltaForTransaction: one row per kind` | 13–19 | die sieben Einzelbeiträge inkl. `H47 = −41 206` |
| `computeBalance: empty ledger is zero` | 20 | |
| `computeBalance is antisymmetric` | 21 | `computeBalance(txs, p1) === −computeBalance(txs, p2)` |
| `computeBalance is order-independent` | 22 | gemischte Reihenfolge, gleiches Ergebnis |
| `column aggregates match the sheet` | 23–28 | `ΣB 2 874 355` · `Σ½B 1 437 161` · `ΣE 198 437` · `Σ½E 99 214` · `ΣH 492 618` · `ΣH ohne H79 489 471` |
| `rent series expands to 50 periods` | 29–30 | 50 Zeilen, `2 307 376` ct, `2022-06` … `2026-07` |
| `K4 settlement and total row count` | 31–32 | `4 128 099` ct · 310 Buchungen |
| `end-to-end balance, both importer modes` | 33–37 | `9 842` ct · `6 695` ct · Referenz `8 645,5` · Delta `−12,5` ct in Toleranz · Delta `+3 147` exakt |
| `isExpense excludes settlements` | 61 | Kategoriesummen ändern sich durch einen Ausgleich nicht |

### 7.3 Pflicht-Tests: Fixkostenplan — `packages/shared/test/plan.test.ts` + `period.test.ts`

| Testname | Vektoren | Prüft |
| --- | --- | --- |
| `costTotal from the six seed items` | 38 | `118 750` ct |
| `incomeTotal from both salaries` | 39 | `500 000` ct |
| `quote formats as de-DE percent` | 40 | `"23,75 %"` aus dem Bruch, nie aus einem Float |
| `share(P2) matches R11 to the cent` | 41 | `47 086` ct, exakter Quotient `48 623,1845…` |
| `share(P1) matches R10 to the cent` | 42 | `71 664` ct |
| `the two shares hit costTotal exactly` | 43 | `47 086 + 71 664 === 118 750` — **kein Cent verloren** |
| `payerShare is the complement, not a second rounding` | 44 | identisch zu 42, aber über `costTotal − other` |
| `the payer absorbs the residual cent` | 45 | `costTotal 100 001`, `50 000/50 000` → other `50 001`, payer `50 000` |
| `divRoundHalfAwayFromZero rounds away from zero` | 46 | `(5,2) → 3`, `(−5,2) → −3` |
| `a disabled or empty plan books nothing` | 47 | `bookableCents === 0` erzeugt keine Zeile |
| `periodsInclusive / nextPeriod / previousPeriod cross year boundaries` | — | `2025-12 → 2026-01`, `2026-01 → 2025-12` |
| `currentPeriod uses Europe/Berlin` | — | mit `setClockForTest`, inkl. 31.12. 23:30 UTC = 01.01. lokal |

### 7.4 Pflicht-Tests: Buchung, Idempotenz, Catch-up — `apps/api/test/plan.test.ts`

| Testname | Vektoren |
| --- | --- |
| `booking the same period twice writes one row` | 48 — `externalKey = fixedplan:{hh}:2026-08` |
| `catch-up books every missed period` | 49 — von `2026-03`, jetzt `2026-08` → 5 Zeilen `2026-04 … 2026-08` |
| `catch-up never books the future` | 50 |
| `a period is computed from the data valid IN that period` | 51 — Gehalt ab `2025-09`, Korrektur ab `2026-05`, Buchung `2026-02` nutzt das alte |
| `a retroactive salary change mutates no booked row` | 52 — Vorschau listet `{period, bookedCents, recomputedCents, deltaCents}` |
| `confirming a recalculation writes signed adjustment rows` | 53 |
| `confirming the same recalculation twice writes nothing` | 54 |
| `imported rent and the live plan never collide` | 55 — `xlsx:rent:2026-07` neben `startPeriod 2026-08` |

### 7.5 Pflicht-Tests: Ausgleich und Saldo — `apps/api/test/settlements.test.ts` + `balance.test.ts`

Vektoren 56–61: voller Ausgleich auf 0 · Teilzahlung `9 842 → 6 526` · Überzahlung `→ −3 474` (erlaubt,
UI benennt es) · negativer Saldo, Zahler ist P1 · stale `expectedBalanceCents` → `409 balance_stale`,
**nichts geschrieben** · Settlements sind aus Kategoriesummen ausgeschlossen.

### 7.6 Import-Tests

**Pfad-Hinweis (§8.2 #16):** alle vier Testgruppen unten leben tatsächlich in DERSELBEN Datei,
`apps/api/test/import-haushalt.test.ts` (Parser-Unit-Tests UND die DB-Integrationstests am Ende),
nicht als vier separate `packages/shared/test/import-*.test.ts` — die Parser selbst liegen unter
`apps/api/scripts/import/`. Die Vektornummern und Prüfinhalte unten gelten unverändert.

Vektoren 62–77, jede Regel R1–R7 mit ihrem echten Label
aus dem Blatt, inklusive der drei Härtefälle: `Amazon27.01.23` ohne Leerzeichen (R2),
`Fressnapf 05.08.16` (Anker außerhalb des Bereichs, heilt sich über R5 zu `2026-08-05`),
`Kalender 2025` (nackte Jahreszahl ist **kein** Datumsbeleg, Fallback auf den Anker darüber).
Gesamtverteilung `56 day / 14 month / 193 estimated`, Ankerzahl pro Spalte `A 16, D 3, G 20`.

Vektoren 78–87: die Textzelle `"31,47" → 3 147`,
die vier Formelzellen über ihren **gecachten** Wert, `"80.430000000000007" → 8 043`,
`"abc"` wirft `unparsable_amount`, fehlende Zelle landet in `skipped_no_amount`, und der deutsche
Eingabeparser (`"1.234,56"` / `"1234,56"` / `"1234.56"` / `"-12,5"`).

Vektoren 88–99, inklusive der Reihenfolge-Fälle
(`Katzen Amazon` → `tiere`, `Nadja Karten` → `geschenke` **vor** `hobby_kreativ`, `Autoversicherung` →
`versicherung` **vor** `mobilitaet`) und der Gesamtabdeckung 243/263.

Der Lauf gegen eine Temp-Datei-DB (die geteilte `bun test`-DB ist unter `NODE_ENV=test` bereits eine
frische Temp-Datei, CLAUDE.md Gotcha #2): 310 Zeilen gegen die echte `Haushalt.xlsx`, die drei
Abstimmungszeilen aus §6.7 der Ledger-Spec, ein **zweiter Lauf schreibt nichts**, und ein
Haushalts-Scoping-Test (review-Befund: ein zweiter Haushalt darf nicht als „bereits importiert“
erscheinen, nur weil derselbe `externalKey` schon für Haushalt A existiert). `--dry-run` wird
zusätzlich als echter CLI-Subprozess geprüft (kein `--household`, exit 0, keine Datenbank berührt).

### 7.7 Weitere API-Tests

`auth.test.ts` (Registrierung legt Haushalt + 21 Kategorien + Plan-Zeile an; Login-Timing gegen
Enumeration; Reset löscht alle Sessions) · `invites.test.ts` (Token ist die Capability; idempotenter
Zweitbeitritt; **dritter Beitritt → `409 household_full`**; abgelaufen → `409 invite_expired`) ·
`transactions.test.ts` (die vier `kind`s werden korrekt auf `(payerId, splitMode)` abgebildet und aus
**beiden** Logins richtig zurückprojiziert; negativer Betrag erlaubt, `0` → 422; PATCH/DELETE auf einer
generierten Zeile → `409 transaction_generated`; Tags replace-all-when-present) ·
`categories.test.ts` (`fixkosten` nicht löschbar; `reassignTo` hängt um) ·
`idempotency.test.ts` (**derselbe `mutationId` zweimal erzeugt eine Zeile und antwortet beide Male
200 mit demselben Zustand** — der Kern des Offline-Replays).

### 7.8 Web-Tests

`lib/persist.test.ts` (Allow-Lists; **nur pausierte** Mutationen werden persistiert; der Persister liest
die User-Id **bei jedem Aufruf**, nicht beim Boot) · `lib/validation.test.ts` (**`apiFieldErrors(null)`
gibt `{}`** — eine idle TanStack-Mutation meldet `error: null`, `unknown` akzeptiert das, `tsc` fängt
einen Rückfall nie) · `lib/format.test.ts` (`formatCurrency` de-DE/en-GB, `formatPercent` aus dem
Bruch) · `lib/unsavedWork.test.ts` (Zähler, nicht Boolean) · `lib/i18n/i18n.test.ts` (Interpolation,
Plural, `resolveWireKey` gibt bei unbekanntem Key `undefined` und **nicht** den rohen Dotted-Key).

### 7.9 Verifikations-Gates

```bash
bun install
bun run typecheck    # tsc für packages/shared, apps/api, apps/web
bun test
bun run build        # vite build + PWA
```

Es gibt **kein** `i18n:check`. Die Typkonstruktion (`LocaleCatalog<typeof de>`) ist hier die
vollständige Durchsetzung; `bun run typecheck` ist das Gate.

Zusätzlich, bei allem, was Persistenz oder Auth berührt: `bun run db:migrate` und `bun run seed` gegen
eine frische `file:`-DB, danach der curl-Durchlauf aus der README. Bei allem, was Dockerfile,
Compose-Stack oder `staticWeb.ts` berührt: Image bauen und den Stack wirklich starten —
**niemals durch eine Pipe** (`docker build … | tail` liefert den Exit-Code von `tail`, ein
gescheiterter Build liest sich als Erfolg). Bei allem, was das Handy-Layout berührt: im echten
Headless-Browser bei 390 px nachsehen.

---

## 8. Offene Punkte und Abweichungen

### 8.1 Bewusst offen gelassen, mit Empfehlung

1. **Der Startmonat der Mietserie ist im Blatt nicht gespeichert.** `2022-06` ist die einzige Annahme,
   die mit `O16`s Beschriftung, mit `P16` (Summe genau der ersten sechs Zeilen = 19 Monate) und mit dem
   Serienende `2026-07` zusammenpasst. *Empfehlung:* als benannte Konstante `RENT_SERIES_START` in
   `apps/api/scripts/import/rent.ts` (tatsächlicher Pfad, nicht `packages/shared/src/import/rent.ts` —
   siehe §8.2 #16), nicht als Literal im Skript, und der Importer druckt sie in seinen Report. Wenn der
   Nutzer widerspricht, ist es eine Zeile.
2. **Die neun Monate zwischen Einzug (2021-09) und `2022-06` bleiben leer.** Vermutlich stecken sie in
   `A16 Miete 5 500,00`. *Empfehlung:* nichts erfinden; der Importer weist die Lücke im Report aus.
3. **Keine der sechs Fixkostenpositionen aus `R8`s Formel ist im Blatt benannt** (nicht nur `150,00`
   und die beiden `5,00` — auch `950`, `55,00` und `22,50` nicht). **Umgesetzt** (Review-Befund,
   `apps/api/scripts/import-xlsx.ts`s `seedFixedCostPlan`, Labels exakt wie in `docs/ledger-spec.md`
   §4.1 festgelegt): `Miete` (950), `Nebenkosten` (150), `Strom` (55,00), `Internet` (22,50),
   `Streaming 1`/`Streaming 2` (je 5,00). Der Betrag ist in jedem Fall richtig, nur das Etikett ist
   eine Wahl dieses Importers — der Nutzer benennt beim ersten Öffnen von `/plan` um, falls er
   widerspricht.
4. **`H79` = 31,47 € wird per Default zurückgeholt**, der importierte Saldo liegt damit 31,47 € über
   `K21`. *Empfehlung:* dabei bleiben. Die Zahl ist seit April 2025 unsichtbar, weil Excels `SUM`
   Textzellen überspringt — das still zu reproduzieren wäre genau der Defekt, den die App beheben soll.
   `--excel-text-quirk` existiert nur, damit der Operator die Blattzahl nachstellen kann.
5. **Ein Sprachwechsel benennt bereits umbenannte Kategorien nicht mit.** Sobald `customLabel` gesetzt
   ist, ist der Text Inhalt. *Empfehlung:* der Hinweis `categories.renameHint` sagt das vorher; keine
   Zweitübersetzung einbauen.
6. **Zeitzone.** Alle Perioden und Tagesgrenzen sind `Europe/Berlin`, hart. *Empfehlung:* so lassen,
   bis jemand umzieht; eine `households.timezone`-Spalte wäre eine Achse, die zwei Personen an einem
   Wohnort nie brauchen.
7. **Kein Export.** Es gibt keinen CSV-/PDF-Export der Buchungen. *Empfehlung:* nachrüsten, sobald der
   erste Steuerberater fragt; die Daten liegen vollständig in `GET …/transactions`.
8. **Rate-Limits sind prozesslokal** (In-Memory-Map). Mit einem Container ist das korrekt.
   *Empfehlung:* falls je zwei Instanzen laufen, gehört das in die DB — vorher nicht.
9. **Kein Volltext.** `q` ist ein `LIKE` auf `description`, ohne gefaltete Spalten. Bei ~1 000 Zeilen
   pro Haushalt ist das messbar unter einer Millisekunde. *Empfehlung:* keine `*_fold`-Spalten bauen;
   wenn es je klemmt, `foldText()` im Client, nicht in SQL.
10. **Ein Konto kann technisch in mehreren Haushalten sein** (das Schema erlaubt es, die UI kennt
    keinen Umschalter). *Empfehlung:* so lassen — die Beschränkung auf zwei Personen gehört an den
    Haushalt, nicht an den Nutzer, und ein zweiter Haushalt ist der Fluchtweg, wenn jemand neu anfängt.

### 8.2 Abweichungen von den Recherche-Dokumenten

| # | Abweichung | Warum |
| --- | --- | --- |
| 1 | **`member_slot ∈ {1,2}` mit `unique(household_id, member_slot)`** statt einer Zählprüfung im Service (`reference-architecture.md` §9 #28). | Die Zwei-Personen-Regel wird ein DB-Fakt statt einer Service-Konvention, und Slot 1 gibt der Saldo-Konvention einen **Datenanker** statt einer Betrachterperspektive. `household_full` bleibt der Fehlercode. |
| 2 | **Tags als `tags` + `transaction_tags`**, nicht als JSON-Array (`ledger-spec.md` §7.1). | Die Aufgabenstellung verlangt beide Tabellen, und Autocomplete nach Häufigkeit, Umbenennen und „alle Buchungen mit Tag X" sind mit einer JSON-Spalte alle drei ein Full Scan. |
| 3 | **`categories.id` ist eine UUID, `categories.slug` der stabile Code-Schlüssel** (`ledger-spec.md` §7.1 benutzt den Slug als Id). | `transactions.category_id` bleibt damit ein gewöhnlicher FK, und eine umbenannte oder neu angelegte Kategorie braucht kein Sonderformat. Der Plan sucht `slug = 'fixkosten'`, der Importer `slug = 'sonstiges'`. |
| 4 | **`mutationId` steht in `mutation_claims`, nicht auf `transactions`** (`ledger-spec.md` §2.1). | Der Anspruch muss auch Änderungen und Löschungen abdecken, die keine neue Zeile erzeugen. Der Claim bleibt ein INSERT auf den Primärschlüssel mit `onConflictDoNothing`. |
| 5 | **`transactions.plan_period` als eigene indizierte Spalte.** | Die Neuberechnung findet ihre Zeilen über einen Index statt über ein `LIKE` auf `external_key`. Der `external_key` bleibt die Idempotenz, `plan_period` ist der Suchpfad. |
| 6 | **`accrual_runs` ist ein reines Audit-Protokoll**, nie eine Idempotenzquelle. | Die Aufgabenstellung ließ die Wahl. Zwei Wahrheiten über „ist Periode p gebucht" wären zwei Gelegenheiten, auseinanderzulaufen; der Unique-Index ist die eine. |
| 7 | **`payer_id` / `person_id` sind `onDelete: "restrict"`**, nicht `cascade`. | Ein gelöschtes Konto darf niemals den Saldo verändern. Der Austritt scheitert stattdessen sichtbar mit `member_has_ledger`. |
| 8 | **`dateSource` hat vier Werte** (`exact` zusätzlich zu `day`/`month`/`estimated`). | `ledger-spec.md` §6.3 definiert nur die drei Import-Werte; von der App geschriebene Zeilen brauchen einen eigenen, sonst sähe jede Buchung des Nutzers aus wie eine Schätzung. |
| 9 | **Alle Endpunkte sind haushalts-skopiert** (`/api/households/:householdId/…`), auch `balance` und `plan` (`ledger-spec.md` §5.2/§4.5 nennt `/api/balance`, `/api/fixed-plan/run`). | Die Aufgabenstellung gibt die Pfade vor, und `requireHousehold()` als Router-Middleware ist genau dann eine Zeile pro Router statt einer Prüfung pro Handler. |
| 10 | **`email_verification_tokens` wird nicht angelegt** (in der Aufgabenstellung als Option genannt). | Ohne OAuth gibt es keine Entscheidung, die von einem bestätigten Adressbesitz abhängt. Eine leere Tabelle mit Endpunkten davor ist Angriffsfläche ohne Nutzen. Passwort-Reset bleibt. |
| 11 | **`GET …/transactions/summary` und `GET …/balance/history` sind neu.** | Die Übersicht würde sonst fünf Queries feuern und die Kategorieanteile clientseitig herleiten — zwei Herleitungen desselben Betrags sind zwei Gelegenheiten für Abweichung. |
| 12 | **`limit` Default 50 / Max 200** statt toon-recipes 24/100. | Eine Buchungsliste ist eine dichte Zeilendarstellung, kein Kartenraster; ein Monat hat rund 60 Zeilen. |
| 13 | **Kein `cors()` im Bootstrap.** | Single-Origin ist gesperrte Entscheidung 7; ein CORS-Block, der nie greift, ist eine Konfiguration, die beim ersten Umbau falsch wird. |
| 14 | **Vier Tabs mit „Erfassen" als eigenem Tab**, Fixkosten/Kategorien/Haushalt in der Sidebar (Vorschlag der Aufgabenstellung war Übersicht/Transaktionen/Erfassen/Profil — übernommen und begründet, §4.1). | Unverändert übernommen; ergänzt ist nur, über welche Karte jeder Sidebar-Eintrag auf dem Handy erreichbar ist. |
| 15 | **`synchronous = FULL`** statt toon-recipes `NORMAL`; **`TEST_DATABASE_URL` auf eine Temp-Datei**. | Beide Recherche-Dokumente empfehlen es; hier ist es festgelegt statt empfohlen. |
| 16 | **Die Import-Parser (`amounts`/`dates`/`categorize`/`rent`/`xlsx-reader`) liegen unter `apps/api/scripts/import/`, nicht unter `packages/shared/src/import/`** (§5.2/§5.3 planten Letzteres, §8.1 #1 nennt explizit `packages/shared/src/import/rent.ts`). Das CLI-Skript heißt `apps/api/scripts/import-xlsx.ts`, nicht `import-haushalt.ts`. Ihre Tests liegen alle zusammen in `apps/api/test/import-haushalt.test.ts`, nicht als vier Dateien in `packages/shared/test/`. **Nachträglich als Abweichung dokumentiert (Review-Befund), nicht rückgängig gemacht:** die Parser hängen an `apps/api/scripts/import/xlsx-reader.ts`, das selbst kein sinnvolles `packages/shared`-Modul ist (ein Ein-Datei-ZIP/XML-Leser für genau ein Einmal-Skript), und die enge Kopplung des ganzen Imports an EIN CLI-Skript hätte sich in `packages/shared` künstlich angefühlt. CLAUDE.md Zeile 175 ("reine Logik … Import-Parser … gehört in packages/shared") ist damit für DIESEN Fall zu pauschal — die vier Parser sind zwar reine Logik, aber ausschließlich vom einmaligen Importer verwendet, nie von `apps/api/src` oder `apps/web`. Wer sie wiederverwenden will (z. B. ein zweites Import-Werkzeug), verschiebt sie zu diesem Zeitpunkt nach `packages/shared/src/import/` — nicht vorher. |
| 17 | **`components/ui/index.ts` ist praktisch totes Barrel — 192 Tiefimporte (`from "@/components/ui/Button"`) gegen 1 Import über das Barrel selbst** (§5.4 plante das Barrel als einzigen erlaubten Pfad). | Nachträglich als Abweichung dokumentiert (Review-Befund), nicht per Codemod rückgängig gemacht: keine Komponente importiert ein Primitive über einen zweiten, konkurrierenden Pfad (kein `../../../components/Button2`), die eigentlich schützenswerte Invariante ("nie eine zweite Implementierung") hält also — nur eben nicht über das Barrel erzwungen. Ein Codemod über 192 Importzeilen ist selbst ein Risiko (stille Umsortierung, Namenskollision); wer neu daran arbeitet, importiert weiter tief aus `components/ui/*`, nie aus einem zweiten Primitive-Ordner. |

### 8.3 Was ein Implementierungs-Agent zuerst liest

`CLAUDE.md` (Gotchas) → dieses Dokument (§2 Schema, §3 Vertrag, §5 sein eigener Tag) →
`docs/ledger-spec.md` (wenn er Fachlogik oder Import baut) →
`docs/reference-architecture.md` (wenn er ein Gerüstteil baut und die wörtliche Vorlage braucht).
