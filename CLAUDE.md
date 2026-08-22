# CLAUDE.md — toon-finance

Kontext für künftige Sessions in diesem Repo. Lies `docs/spec.md` (die verbindliche Vorgabe: Schema,
API-Vertrag, Screens, Datei-Layout, i18n-Keys, Testplan) zusammen mit dieser Datei. Wer Fachlogik oder
den Import baut, liest zusätzlich `docs/ledger-spec.md`; wer ein Gerüstteil baut, `docs/reference-architecture.md`.

**Was es ist:** eine Haushaltskasse für **genau zwei Personen**. Gemeinsame Ausgaben werden erfasst,
aufgeteilt und über einen einzigen Saldo ausgeglichen. Herzstück ist der **Fixkostenplan**, der aus den
beiden Einkommen und den festen Kosten jeden Monat den einkommensproportionalen Anteil der zweiten
Person automatisch bucht. Deutschsprachige Oberfläche (de Default, en zusätzlich), EUR, `de-DE`.
Installierbare PWA mit Offline-Erfassung. Bun-Workspaces-Monorepo.

**Geld ist ganzzahliger Cent. Überall.** Kein `real`, kein Float, kein `parseFloat` auf Nutzereingabe,
keine Dezimalstrings auf der Leitung. Formatierung passiert ausschließlich am Rand des Render-Baums.
Das ist die eine Regel, deren Verletzung man erst Monate später bemerkt — an einem Saldo, der um zwei
Cent nicht stimmt und den niemand mehr rekonstruieren kann.

## Gesperrte Entscheidungen — NICHT neu entwerfen

1. **Genau zwei Personen, vier feste Arten.** `household_members.member_slot ∈ {1,2}` mit
   `unique(household_id, member_slot)` — die Zwei-Personen-Regel ist ein DB-Fakt, keine
   Service-Konvention. Gespeichert wird symmetrisch: `payer_id` + `split_mode ∈ {SPLIT_EQUAL,
   OTHER_ONLY, SETTLEMENT}`. Die vier UI-Arten `MINE_SPLIT` / `THEIRS_SPLIT` / `FOR_THEM` / `TRANSFER`
   sind eine **Projektion auf den Betrachter**, berechnet beim Rendern, **nie gespeichert**. Es gibt
   keine `beneficiary_id`, keine Prozentregel, keine `shares`-Tabelle, keinen N-Personen-Algorithmus.
   Slot 1 ist der Anker der Saldo-Konvention: `balanceCents > 0` heißt „Slot 2 schuldet Slot 1".
2. **Kategorien + freie Tags.** 21 Default-Kategorien pro Haushalt, stabile `slug`s im Code, Label aus
   dem i18n-Katalog, solange `custom_label` null ist. `fixkosten` ist systemeigen (nicht löschbar, nicht
   umbenennbar) — der Plan schreibt hinein. Tags sind normalisierte Zeilen (`tags` +
   `transaction_tags`), keine JSON-Spalte.
3. **Fixkostenplan mit einkommensproportionaler Monatsbuchung.**
   `share(other) = divRoundHalfAwayFromZero(income × costTotal, incomeTotal)` — **genau eine Rundung**,
   in einem Integer-Ausdruck. Der Anteil des Zahlers ist per Definition das Komplement
   (`costTotal − other`), also trägt er jeden Restcent, und die zwei angezeigten Zahlen summieren sich
   immer exakt. Gebucht wird nur der Anteil der anderen Person, als `OTHER_ONLY`. **Gebuchte Perioden
   sind unveränderlich**; Korrekturen sind zusätzliche Anpassungsbuchungen mit eigenem `external_key`.
4. **Auth: nur E-Mail + Passwort.** `Bun.password` argon2id, opake Session-Ids als Primärschlüssel der
   `sessions`-Tabelle, Cookie `toon_session` (`HttpOnly; SameSite=Lax; Secure(prod); Path=/`, 30 Tage
   sliding). Kein OAuth, kein `arctic`, keine `oauth_accounts`, **keine E-Mail-Bestätigung** (sie
   existierte in toon-recipe nur, um OAuth-Auto-Linking absichern zu können). Passwort-Reset über
   gehashten Single-Use-Token. Die zweite Person kommt über einen Einladungstoken; ein dritter Beitritt
   ist `409 household_full`.
5. **i18n de/en über die typgeprüfte Katalog-Schicht**, ohne i18n-Dependency. `de` ist Quellkatalog
   (`satisfies NamespaceCatalog<"…">`), `en` ist `LocaleCatalog<typeof de>` — ein fehlender,
   überzähliger oder formfremder Key ist ein **Compile**-Fehler. Kein `i18n:check`-Skript;
   `bun run typecheck` ist das Gate. Die deutschen Texte stehen vollständig in `docs/spec.md` §6 und
   werden nicht neu erfunden.
6. **PWA + Offline-Erfassung**, vier Bausteine gemeinsam (siehe Gotchas). Doppelbuchung beim Replay ist
   hier ein falscher Saldo, kein falscher Einkaufszettel.
7. **Docker single-origin + GETEILTER Caddy.** EIN Container; die API serviert die gebaute PWA über
   `WEB_DIST_DIR`. `PUBLIC_API_URL=""` → relative URLs → **kein CORS-Eintrag im Bootstrap**. Der Caddy
   davor terminiert nur TLS (ohne Secure Context registriert sich kein Service Worker, also keine PWA)
   und **steht nicht mehr in diesem Repo**: er gehört zum `toon-edge`-Stack (`/opt/toon-edge`), der die
   Ports 80/443 für alle toon-Apps auf dem Host hält und nach Hostnamen verteilt — zwei Stacks können
   nicht beide `:443` binden. Dieser Stack hängt am externen Netz `toon-edge` unter dem Alias
   **`finance-app`**; siehe die Compose-Falle unten. An der App selbst hat sich dadurch nichts geändert.
8. **Stack**: Bun 1.4.0, Bun.serve + Hono, libSQL via `@libsql/client` + `drizzle-orm/libsql`,
   React 19 + Vite + TanStack Router (code-based, kein Codegen) + TanStack Query + Tailwind v4,
   TypeScript 7 strict, kein `baseUrl`, kein `any` in exportierten Signaturen.

**Nicht gebaut:** OCR · Beleg-Foto · PDF/URL-Import · Import-Drafts · Uploads/Thumbnails · OAuth ·
E-Mail-Bestätigung · Resend · N-Personen-Gruppen mit Rollen · Bank-Anbindung · CSV-Import ·
Volltextsuche mit gefalteten Spalten · `scripts/i18n-check.ts`.
Die xlsx-Übernahme ist ein **einmaliges CLI-Skript**, kein UI-Feature.

## Architektur

```
packages/shared   Zod-Schemas + abgeleitete Typen + die REINE Fachlogik (Cent-Arithmetik, Ledger,
                  Perioden, Fixkostenplan, Import-Parser) + die i18n-Runtime + die SERVER-Kataloge.
                  Einzige Quelle jeder Request/Response-Form. Von api UND web als "@toon/shared".
apps/api          Bun.serve + Hono. src/index.ts mountet in dieser Reihenfolge:
                    /api/auth
                    /api/households                                 (invites-Routen VOR /:householdId)
                    /api/households/:householdId/transactions        (/summary VOR /:transactionId)
                    /api/households/:householdId/categories
                    /api/households/:householdId/tags
                    /api/households/:householdId/plan
                    /api/households/:householdId/balance
                    /api/households/:householdId/settlements
                    webAppMiddleware(WEB_DIST_DIR)                   <- GANZ zuletzt, SPA-Fallback
                  Router bringen ihre Middleware selbst mit: router.use("*", requireSession());
                                                             router.use("*", requireHousehold());
apps/web          React 19 + Vite + TanStack Router + TanStack Query + Tailwind v4.
```

Datenfluss auf der Web-Seite: `lib/api.ts` (der **einzige** Ort mit `fetch`) → `lib/queries.ts`
(Query-Keys + `queryOptions` + `invalidate.*`) → Feature-Hooks → Screens. `lib/session.tsx` hält
Session und Haushalt und exportiert die Guards `RequireAuth` / `RequireHousehold`.

Die Reihenfolge zählt an drei Stellen: `/invites/:token` und `/invites/accept` **vor** `/:householdId`;
`/transactions/summary` **vor** `/transactions/:transactionId`; `staticWeb` als **letzter** Mount.

## Datei-Layout (wo was liegt)

Der vollständige Baum mit jedem anzulegenden Pfad steht in `docs/spec.md` §5 — inklusive
Besitzer-Tags für die parallele Arbeit. Kurzform:

```
apps/api/src/
  index.ts                 Bootstrap; KEIN cors() (single-origin)
  env.ts                   zod-validiert, lädt die Root-.env selbst, exit(1) mit lesbarer Liste
  db/{schema,client,migrate}.ts     client.ts setzt die PRAGMAs pro Connection — synchronous = FULL
  lib/{errors,http,types,cookies,locale,validation,clock}.ts
  lib/clock.ts             nowMs() + setClockForTest() — der Seam für zeitabhängige Plan-Tests
  middleware/session.ts    requireSession / optionalSession / loadSession
  middleware/household.ts  requireHousehold() — 401/404/403 in EINER Query, setzt memberSlot mit
  middleware/staticWeb.ts  serviert apps/web/dist, mountet LETZTER, besitzt den SPA-Fallback
  routes/{auth,households,transactions,categories,tags,plan,balance,settlements}.ts
  services/{auth,households,ledger,categories,tags,plan,mail}/
apps/api/scripts/          NEBEN src/, nicht darin — das tsconfig inkludiert beide getrennt
  {migrate,seed,reset-password,plan-run,import-xlsx}.ts
  import/{xlsx-reader,amounts,dates,categorize,rent}.ts           [NICHT unter
                           packages/shared/src/import/, obwohl das ursprünglich so geplant war —
                           docs/spec.md §8.2 #16]
apps/api/test/             ALLE API-Tests, ebenfalls NEBEN src/ (test/, NICHT tests/ — das tsconfig
                           inkludiert nur test/**)
apps/web/src/
  router.tsx               der Route-Baum; Screens lazy über lib/lazy-page.tsx
  lib/{api,queries,query-client,session,persist,pwa,unsavedWork,storage,theme,format,validation,
       navigation,cn,lazy-page}.ts
  lib/i18n/                store.ts (ambienter Locale-Store + translate()) · I18nProvider.tsx
                           locale.ts · catalogs/<ns>.{de,en}.ts
  components/ui/           die EINZIGEN UI-Primitives — nie eine zweite Implementierung
  components/money/        AmountText · KindBadge · PeriodLabel — von beiden Feature-Gruppen benutzt
  components/layout/       AppShell, TopBar, BottomTabBar, SideNav, nav-items, Banner, ErrorBoundary
  features/{auth,settings,household,transactions,overview,plan,categories}/
packages/shared/src/
  money.ts ledger.ts period.ts plan.ts categories.ts tags.ts
  schemas/*.ts   i18n/*.ts
```

## Navigation (vier Tabs, und was bewusst keiner mehr ist)

`components/layout/nav-items.ts` ist die einzige Quelle. `NAV_ITEMS` ist Tab-Bar **und** Sidebar-Kopf,
`SECONDARY_NAV_ITEMS` ist nur Sidebar. Die Items tragen Katalog-**Keys**, keine Labels — ein zur
Importzeit aufgelöstes Label friert die Tab-Bar auf der zuerst geladenen Sprache ein.

| | |
| --- | --- |
| Tabs | Übersicht `/` · Buchungen `/transactions` · Fixkosten `/plan` · Profil `/settings` |
| Nur Sidebar | Kategorien `/categories` · Haushalt `/household` |
| Überall | **Erfassen** — der schwebende „+" (`QuickAddFab`) bzw. der Primärknopf der Sidebar |

**Unter `lg` gibt es keine Sidebar**, also MUSS jedes `SECONDARY_NAV_ITEMS`-Ziel von einem Tab-Screen
erreichbar sein, sonst existiert es auf dem Handy nicht:

- **Kategorien** ← der Fußzeilen-Link in der `SpendByCategoryCard` auf `/` (zusätzlich, nicht als
  Ersatz: derselbe Link unten im Kategorie-Sheet des Erfassen-Flows).
- **Haushalt** ← die `HouseholdCard` auf `/settings`. Dort sitzt die Einladung der zweiten Person; ohne
  sie ist ein frisch installierter Haushalt auf dem Handy nicht zu zweit zu bekommen.

**Erfassen ist ein globales Blatt, kein Tab** (Redesign, `Toon Finance - Redesign.dc.html`). Der „+"
liegt unten rechts auf **jedem** Screen und öffnet auf dem Handy ein Bottom Sheet, auf dem Desktop
einen Dialog — beide zeigen Betrag, Art, Beschreibung, Datum und Kategorie **gleichzeitig**;
„Mehr Details" gibt es nicht mehr und darf nicht zurückkommen. Das kostet keine Navigation, und der
freigewordene vierte Tab geht an **Fixkosten**, das vorher nur über die `FixedCostCard` erreichbar war.

Die zwei alten Einwände gegen einen FAB sind beantwortet, nicht ignoriert: er sitzt unten **rechts**
in der Daumenzone (nicht mittig, wo er mit der Tab-Bar konkurrierte) und klebt über der Leiste per
`.bottom-tabbar`, nie `bottom-0`. Dass er beim Scrollen Inhalt überdeckt, ist der Preis — deshalb
stehen die Beträge in den Listen links von der rechten Kante, nie darunter.

`/new` bleibt als **Route** bestehen (verlinkbares Ziel, PWA-Deep-Link), ist aber kein Tab mehr und
teilt sich mit dem Blatt exakt eine Implementierung: `features/transactions/lib/useCreateForm.ts`
(Validierung, `mutationId`, Leeren, Undo-Toast) plus `TransactionFormFields`. Zwei Rahmen, ein
Formular — nie eine zweite Kopie.

Die `FixedCostCard` auf `/` bleibt trotzdem: die Monatszahl gehört neben den Saldo, den sie bewegt.
Ein eigener Saldo-Tab wäre weiterhin redundant — der Saldo ist die Kopfzeile von `/`.

**Drei Farbflächen, drei Bedeutungen** (`styles/theme.css`): **Petrol** ist die Marke und füllt genau
EINE Fläche, den `BalanceHero` (`Card tone="brand"`). **Gold** heißt Fixkostenplan und nichts sonst
(`Card tone="accent"`). **Grün/Rot** bleiben Ledger-Semantik. Eine zweite petrolgefüllte Karte nimmt
dem Saldo den ersten Blick; eine goldene Karte anderswo macht beide Farben bedeutungslos.

## Konventionen

- **Fehler**: immer `{ error: { code, message, details? } }` mit passendem Status. `code` aus
  `ERROR_CODES` — ein Code ist **Wire-Contract und wird nie umbenannt**. `message` ist in der
  verhandelten Locale gerendert, also **nie darauf branchen**. Die Aufrufstelle übergibt einen
  `ErrorText` (ein `ServerKey` oder `{ key, values }`), **nie einen Satz** — `tsc` lehnt ein Literal ab.
  `Error.message` bleibt englisch, damit Logs einsprachig sind. Nie ein Stacktrace nach außen.
- **Auth-Prüfungen**: nur über `requireSession()` + `requireHousehold()` als Router-Middleware. Niemals
  eine Mitgliedschaftsabfrage inline in einem Handler.
- **IDs** `crypto.randomUUID()`. **Zeitstempel** integer unix ms in SQLite, ISO-Strings auf der Leitung
  (`toIso()`). **Perioden** `'YYYY-MM'`-Text, lexikographisch sortierbar, CHECK-constrained.
- **Geld** integer Cent, signiert, auf der Leitung als `…Cents`. Der einzige verbotene Betrag ist `0`.
  Negative Beträge sind gültig und bedeutungstragend (Erstattungen, Gutschriften, Korrekturen).
- **Listen** `{ items, total, limit, offset }`, limit Default 50 / Max 200.
- **PATCH-Semantik**: Kind-Arrays (`tags`) sind replace-all, wenn das Feld vorhanden ist, und
  unangetastet, wenn es fehlt.
- **Generierte Buchungen** (`origin ≠ 'manual'`) werden nie bearbeitet oder gelöscht →
  `409 transaction_generated`. Korrekturen entstehen als zusätzliche Zeile.
- **Web**: kein `fetch` außerhalb `lib/api.ts`. Jeder Request mit `credentials: "include"` und
  `Accept-Language: getLocale()`.
- **UI-Primitives** kommen aus `@/components/ui` — nie eine zweite Implementierung daneben.
- **`WEB-TX` und `WEB-SALDO` teilen keine Datei.** Was beide brauchen, gehört `WEB-KERN`
  (`lib/api.ts`, `lib/queries.ts`, `components/money/*`, die Kataloge) und wird vollständig vorab
  angelegt. Keine Feature-Gruppe importiert aus dem `features/`-Verzeichnis der anderen.
- **Reine Logik** (Cent-Arithmetik, Saldo, Perioden, Plan, Import-Parser) gehört in `packages/shared`
  mit Unit-Tests, nie in einen Route-Handler und nie in eine Komponente.
- **TypeScript 7**, `strict: true`, kein `any` in exportierten Signaturen. `baseUrl` gibt es nicht mehr
  — nicht hinzufügen; `paths` lösen relativ zur jeweiligen tsconfig-Datei auf und werden je Workspace
  wiederholt.

## Gotchas, die dich beißen werden

Die ersten sechzehn sind aus `toon-recipe` übernommen (dort teuer gelernt, hier belegbar durch
`docs/reference-architecture.md` §9). Danach folgt, was aus der Fachlogik dieses Repos entsteht.

**Aus toon-recipe übernommen**

1. **Die Verbindungs-PRAGMAs in `db/client.ts` sind load-bearing, und `synchronous` muss pro Connection
   neu gesendet werden.** `journal_mode` ist persistent in der Datei, `synchronous` nicht — deshalb
   steht beides in `createDatabase()` und nicht in einer Migration. libSQL-Defaults sind
   `journal_mode=delete` + `synchronous=FULL`, gemessen 15,5 ms für einen Einzeil-INSERT; mit WAL allein
   5,2 ms; mit WAL + `synchronous=NORMAL` 0,04 ms. **Hier gilt WAL + `synchronous = FULL`** — toon-recipe
   begründet `NORMAL` wörtlich mit *„the right trade for a recipe box, not for a ledger"*, und das hier
   ist das Kassenbuch. Der Preis (~5 ms pro Write) ist bei ein paar Dutzend Writes am Tag unsichtbar;
   die letzte committete Ausgleichszahlung nach einem Stromausfall zu verlieren, ist es nicht.
2. **`bun test` erzwingt `NODE_ENV=test` → `DATABASE_URL = TEST_DATABASE_URL ?? <frische Temp-Datei>`.**
   Eine Entwickler-`.env` kann Tests nie auf die echte DB zeigen. Das ist **bereits** die richtige Wahl,
   NICHT `file::memory:` (eine frühere Version dieses Gotchas behauptete das fälschlich, ebenso ein
   Kommentar in `ci.yml` — beide sind jetzt korrigiert): libSQL 0.17.4 öffnet für `client.transaction()`
   eine zweite Connection, und bei `file::memory:` wäre das eine brandneue, leere DB — nach dem Commit
   wären alle Tabellen weg, und `withTransaction` würde dort still auf sequentielle Statements
   degradieren. `env.ts`s `defaultTestDatabaseUrl()` erzeugt stattdessen pro Prozess EINE frische
   `file:<tmpdir>/toon-finance-test-<uuid>.db`, geteilt von jeder Testdatei in diesem `bun test`-Lauf
   (dieselbe Falle wie bei `file::memory:`, falls du dich fragst, warum keine Testdatei
   `TEST_DATABASE_URL` selbst setzt: sie brauchen es nicht, der Default ist schon eine echte Datei). Ein
   Ledger, dessen Tests nie eine echte Transaktion sehen, testet seine wichtigste Eigenschaft nicht.
3. **`apps/api/tsconfig.json` inkludiert `test/**`, niemals `tests/`.** Ein Verzeichnis `apps/api/tests/`
   ist für `bun run typecheck` unsichtbar — die Tests laufen, aber nichts darin wird je typgeprüft.
4. **`mock.module` leakt über Testdateien und bun stellt es nie wieder her**, und die
   Ausführungsreihenfolge ist **Dateisystem**-Ordnung, nicht alphabetisch. Ein in Datei A installierter
   Stub steht in Datei B noch, und welche Datei „B" ist, hängt vom Rechner ab — der Fehler erscheint
   also nur manchmal. Stattdessen ein expliziter Setter-Seam (`setMailer`, `setLocaleForTest`,
   `setClockForTest`), den die Datei in `afterAll` zurückgibt.
5. **Vite braucht `envDir: "../../"` UND `envPrefix: ["VITE_","PUBLIC_"]`.** Ohne beides wird
   `import.meta.env.PUBLIC_API_URL` nicht inlined und die App redet mit dem falschen Port.
6. **Kein `baseUrl` in tsconfig** (in TS 7 entfernt). `paths` lösen relativ zur tsconfig-Datei auf und
   werden deshalb in jedem Workspace wiederholt.
7. **`setMutationDefaults` statt inline `useMutation`.** Eine dehydrierte Mutation behält ihre
   `variables`, aber **keine Funktion** — beim Replay wird die `mutationFn` über den `mutationKey`
   gefunden. Die Defaults müssen also existieren, **bevor** der Persister restauriert; deshalb der
   Seiteneffekt-Import von `features/transactions/lib/offline.ts` in `app.tsx` und deshalb liegt der
   QueryClient im Modul-Scope von `lib/query-client.ts`, nicht in `app.tsx`.
8. **`networkMode: "offlineFirst"`** ist das, was einen fehlgeschlagenen Write **pausieren** statt
   scheitern lässt. Ohne das gibt es nichts zu persistieren. Die zugehörige Read-Query braucht es
   ebenfalls, sonst hängt ein Kaltstart ohne Netz ewig in `pending`.
9. **`shouldPersistMutation` persistiert NUR pausierte Mutationen einer kleinen Allow-List.** Eine
   bereits abgeschlossene hat den Server erreicht — sie beim nächsten Start erneut auszuführen wäre
   genau der Doppel-Apply, gegen den das Idempotenz-Ledger existiert. Allow-List hier: der
   `["toon","tx",…]`-Namensraum. Auth-, Haushalts-, Kategorie- und **Fixkostenplan**-Mutationen bleiben
   draußen: ein Tage später abgespieltes „Plan geändert" ist keine Nettigkeit.
10. **Die `mutationId` wird BEIM AUFRUF gemünzt, nie in der `mutationFn`** — die läuft beim Replay
    erneut. Serverseitig ist der Claim ein **INSERT auf den Primärschlüssel** mit
    `onConflictDoNothing`, kein SELECT-dann-Write; zwei Replays derselben Id würden sonst beide „noch
    nicht angewendet" lesen. Der zweite Aufruf antwortet **200 mit dem aktuellen Zustand**, nicht 409.
11. **`/api` gehört nie in ein cachendes `runtimeCaching` des Service Workers**, und
    `navigateFallbackDenylist: [/^\/api\//]` bleibt. Die Offline-Kopie des Ledgers **ist** der
    persistierte TanStack-Cache — derselbe Speicher wie die pausierten Mutationen. Ein
    `NetworkFirst`-Treffer würde TanStack einen veralteten Body als frischen Erfolg unterschieben,
    `onSuccess` schriebe ihn über den optimistischen Zustand, und die gerade erfasste Buchung wäre
    still weg.
12. **`skipWaiting` bleibt AUS.** Mit `true` übernimmt ein neuer Worker ein Dokument, das noch das alte
    Bundle fährt; die nächste Lazy-Route fragt den neuen Precache nach einer `assets/Page-<hash>.js`,
    die `cleanupOutdatedCaches` beim Activate gelöscht hat → Lazy-Import-Fehler in die ErrorBoundary.
    `lib/pwa.ts` besitzt den Tausch, mit **einem** geguardeten Reload und **ohne** Fallback-Timer (ein
    blinder Reload wiederholt einen scheiternden Tausch bei jedem Start — eine Boot-Schleife).
13. **Der persistierte Cache wird pro User-Id namensraumiert, der Persister liest die Id bei JEDEM
    Aufruf** (nicht beim Boot — sonst landen die frisch geladenen Daten von B unter dem Key von A), ein
    Kontowechsel purgt zuerst, und eine Allow-List entscheidet, was überhaupt geschrieben wird. Zwei
    Personen, ein Haushalt, oft ein geteiltes Tablet — und die Query-Keys sind identisch. `useLogout`
    räumt in **`onSettled`, nicht `onSuccess`** auf: scheitert der Request (offline), muss der lokale
    Zustand trotzdem weg sein.
14. **`.px-safe` niemals neben `px-4`** — es ist ein flacher Override, und die handgeschriebenen
    Utilities in `styles/index.css` werden nach allem Tailwind emittiert. `.px-gutter` benutzen, die
    Breakpoint-Gutter als **Variable** (`lg:[--gutter:2rem]`), nie als zweites Padding-Utility.
15. **Klebrige Leisten brauchen `.bottom-tabbar`, nie `bottom-0`.** Die „Buchen"-Leiste auf `/new` ist
    genau der Fall: mit `bottom-0` liegt sie auf dem Handy unter der Tab-Bar und ist nicht antippbar.
    Dazu gehört eine ungebrochene Flex-Kette (`min-h-dvh` → `<main> flex-1 flex flex-col` → Page-Root
    `flex-1` → Spacer `flex-1`), und eine Page-Root wiederholt **nichts** von
    `mx-auto max-w-5xl px-gutter pt-4 pb-tabbar` — das besitzt `<main>`.
16. **Eine idle TanStack-Mutation meldet `error: null`, nicht `undefined`.** Deshalb gibt
    `apiFieldErrors` für nullish ein leeres Objekt zurück — sonst begrüßt ein Formular den Nutzer mit
    „Etwas ist schiefgelaufen", bevor er irgendetwas abgeschickt hat. `unknown` akzeptiert `null`, also
    fängt `tsc` einen Rückfall nie; der Unit-Test ist die Absicherung.

**Weitere übernommene Regeln, kürzer**

17. `controlClasses` trägt `min-w-0`; in Grid-Templates `minmax(0,1fr)` statt `1fr` (Betrag und Datum
    stehen nebeneinander in `grid-cols-2`). Ein `<fieldset>` hat `min-inline-size: min-content` und
    braucht explizit `min-w-0`. `block` schlägt `line-clamp-N`. Ein Header bekommt **einen**
    Overflow-Trigger, keine Reihe von Icon-Buttons.
18. `clientIp()` glaubt `X-Forwarded-For` nur bei `TRUST_PROXY=1`; im Caddyfile bleibt
    `header_up X-Forwarded-For {remote_host}` stehen, obwohl Caddy es als „unnecessary" loggt — eine
    `trusted_proxies`-Zeile würde einen gefälschten Wert zum ersten Eintrag machen und jedes
    Rate-Limit zum No-op. **Der Caddyfile liegt jetzt im `toon-edge`-Repo**, als ein Snippet für alle
    Apps — die Zeile schützt damit beide Apps auf einmal, und wer sie dort entfernt, öffnet zwei
    Auth-Bruteforce-Lücken statt einer.
19. **DER NETZWERK-ALIAS IN docker-compose.yml IST LOAD-BEARING.** `app` heißt in toon-recipe genauso
    `app`, und Compose trägt den SERVICENAMEN als Alias in jedes Netz ein, dem ein Container beitritt
    — im geteilten `toon-edge`-Netz hörten also zwei Container auf `app`, und der Proxy verteilte per
    DNS-Round-Robin abwechselnd an die Finanz- und die Rezept-App. Der Fehler knallt NICHT: die Seite
    lädt, nur jeder zweite Request kommt aus der falschen Anwendung. Deshalb `aliases: [finance-app]`,
    und der Caddyfile spricht ausschließlich diesen Alias an. `mailpit` bleibt bewusst OFF dem
    edge-Netz — sein UI zeigt jeden Passwort-Reset-Link.
20. `GET /api/auth/sessions` gibt **Handles** heraus, nie die Session-Id: `logger()` schreibt
    `c.req.path`, ein 30-Tage-Token stünde sonst im Access-Log und wäre als Cookie wiederverwendbar.
21. `/password/forgot` antwortet **204 für bekannte und unbekannte Adressen**, mit identischem Body und
    Timing; das Rate-Limit greift **vor** dem Lookup. Zwei Nutzer heißt nicht „kein
    Enumerationsrisiko" — es heißt, dass zwei Adressen die einzigen gültigen Ziele sind.
22. Ein fehlgeschlagener Mailversand darf seine Aktion nie scheitern lassen (`trySendMail`, immer nach
    dem Commit). Und **`delivered` allein ist nicht „eine Mail ging raus"** — der ConsoleMailer
    resolved auch. `mailDeliveryOf()` liefert `sent` / `not_configured` / `failed`, und die UI darf die
    letzten beiden nie als Erfolg rendern.
23. Der Einladungstoken **ist** die Capability; die eingeladene E-Mail wird bewusst nicht erzwungen
    (sonst kann man den Link nicht weiterleiten); `acceptInvite` ist idempotent. `invites.token` steht
    im Klartext, `password_reset_tokens.token_hash` nur als SHA-256 — *eine geleakte invites-Tabelle
    kostet eine Mitgliedschaft, eine geleakte reset-Tabelle jedes Konto.*
24. `safeNextPath` muss Backslashes, Steuerzeichen und Leerzeichen ablehnen (`new URL("/\evil.com",
    origin)` ergibt `http://evil.com/`), und `RequireAuth` macht **höchstens einen Redirect pro Mount**
    (Ref + `safeNextPath`), sonst wächst `?next=` bis zur Kilobyte-URL.
25. `translate()` ist **nur für Code außerhalb von React** (api-Fallbacks, Toasts aus Event-Handlern,
    ErrorBoundary). In einer Komponente typecheckt es und rendert dort veraltete Copy — genau das macht
    es gefährlich.
26. `"system"` ist die dritte Locale- und Theme-Präferenz und bedeutet **„Key aus localStorage
    entfernen"**, nicht „aufgelösten Wert speichern". Die zwei Zustände zu kollabieren, zeigt jemandem
    „Deutsch" an, der nie etwas gewählt hat.
27. Label-Maps, die zur Importzeit einfrieren, sind verboten. Wire-Wert `MINE_SPLIT`, Label über
    `TX_KIND_LABEL_KEYS` — genau wie Nav-Items Keys tragen.
28. Bun benutzt den **Isolated Linker** (seit 1.3; unter 1.4.0 verifiziert unverändert — der neue
    opt-in Global Virtual Store ändert das Layout nicht, `node_modules/.bun/` enthält weiterhin echte
    Verzeichnisse ohne absolute Symlinks): die echten Pakete liegen unter `node_modules/.bun/`, jedes
    Workspace hat seinen eigenen Symlink-Baum. Ins Image müssen **drei** Pfade kopiert werden
    (`/app/node_modules`, `/app/apps/api/node_modules`, `/app/packages/shared/node_modules`), sonst
    baut und startet der Container und stirbt beim ersten Request mit
    `Cannot find module '@libsql/client'`.
29. `sw.js` und `index.html` dürfen **nie** gecacht werden (sonst kann die App sich nie wieder selbst
    updaten); `.webmanifest` braucht `application/manifest+json` (`Bun.file().type` sagt
    `application/octet-stream`, und ein Manifest mit falschem Typ wird still ignoriert → keine PWA);
    eine fehlende Datei **mit Endung** muss ein echter 404 sein, kein SPA-Shell.
30. `/app/data` ist ein VOLUME — alles, was zur Build-Zeit dorthin geschrieben wird, ist zur Laufzeit
    unsichtbar. **Docker-Builds nie durch eine Pipe verifizieren** (`docker build … | tail` liefert den
    Exit-Code von `tail`).
31. `apple-mobile-web-app-status-bar-style: black-translucent` ist verboten; `viewport-fit=cover` +
    `<meta theme-color>` ist der Ersatz. Handy-Layout im echten Headless-Browser bei 390 px prüfen,
    nicht durch Lesen von Tailwind-Klassen.

**Aus der Fachlogik dieses Repos**

32. **`halfForOther(-101)` muss `-50` sein, nicht `-51`.** Der Restcent gehört dem Zahler, in **beiden**
    Vorzeichenrichtungen: `(cents - (cents % 2)) / 2` (JS `%` nimmt das Vorzeichen des Dividenden,
    trunkiert also zur Null). `Math.floor(-101/2)` ergibt `-51` und gäbe dem **Nicht**-Zahler den
    größeren Anteil einer Gutschrift, während der Zahler den größeren Anteil einer Kosten trägt — der
    Restcent würde mit dem Vorzeichen die Seite wechseln. In Tests aus nur positiven Beträgen ist das
    unsichtbar und zeigt sich später als Drift in einem Ledger mit 25 negativen Zeilen. Nie
    `Math.round(c/2)`, nie `~~(c/2)`, nie `c >> 1`.
33. **Es wird pro Transaktion halbiert, nicht die Summe.** Das Blatt halbiert die Spaltensumme
    (`K14 = ROUND(K13/2,2)`); die App halbiert jede Zeile. Das ist ein Unterschied von 22 Cent auf dem
    importierten Bestand, und er wird vom Importer **ausgewiesen**, nicht wegjustiert. Pro Transaktion
    ist richtig: es ist, was der Nutzer auf jeder Zeile sieht, es ist reihenfolgeunabhängig, und es
    überlebt das Löschen einer einzelnen Zeile ohne Neuberechnung des ganzen Ledgers.
34. **Im Fixkostenplan wird genau einmal gerundet, und nur der Anteil der anderen Person.** Der Anteil
    des Zahlers ist per Definition das Komplement (`costTotal − other`), also trägt er jeden Restcent
    und die zwei angezeigten Zahlen summieren sich immer exakt auf. Wer `payerShare` über einen zweiten
    Rundungsaufruf rendert, bekommt `costTotal ± 1` auf dem Bildschirm, und der Nutzer sieht es. Die
    Quote geht als **Bruch** (`quoteNumerator/quoteDenominator`) auf die Leitung und wird nie als
    Zwischenfaktor benutzt.
35. **Der Catch-up rechnet historisch und bucht nie die Zukunft.** Periode `2026-03` wird aus den
    Positionen und Gehältern berechnet, die **in** März galten, auch wenn der Lauf im August passiert —
    dafür existieren die temporalen `active_from` / `valid_from`. `to` ist die aktuelle Periode,
    inklusive. Und `bookableCents === 0` schreibt **keine** Zeile.
36. **Gebuchte Perioden sind unveränderlich.** Eine rückwirkende Gehaltsänderung rührt keine bereits
    geschriebene Zeile an; sie erzeugt eine **Anpassungsbuchung** mit `external_key =
    fixedplan-adj:{hh}:{p}:{bookedCents}` — der superseded Betrag steckt im Key, damit eine zweite
    Korrektur eine zweite Anpassung erzeugt, während ein Wiederholungslauf gegen unveränderte Daten
    kollidiert und nichts tut. Grund: die beiden gleichen gegen einen Saldo aus, den **beide gesehen
    haben**. Verschöbe eine rückwirkende Änderung einen vergangenen Monat, würde die bereits geleistete
    Zahlung still nicht mehr passen.
37. **`expectedBalanceCents` ist bei `POST …/settlements` Pflicht.** Passt es nicht mehr — die andere
    Person hat vor dreißig Sekunden gebucht —, ist die Antwort `409 balance_stale` mit dem aktuellen
    Wert, und der Client fragt neu. Gegen eine Zahl auszugleichen, die man nicht gesehen hat, ist das
    einzige Rennen in dieser App, das echtes Geld kostet. Über- und Teilzahlung sind **erlaubt** und
    werden benannt, nicht geklemmt.
38. **`origin` ist die Trennlinie zwischen App und Mensch.** Die Neuberechnung findet ihre Zeilen über
    `(household_id, origin, plan_period)` — eine manuelle Zeile kommt in keiner dieser WHERE-Klauseln
    vor und kann von keiner Plan-Operation getroffen werden. Umgekehrt sind `PATCH`/`DELETE` auf
    `origin ≠ 'manual'` `409 transaction_generated`. `origin` hat **keinen** Drizzle-Default, damit
    `tsc` an jeder Insert-Stelle scheitert, die sie vergisst.
39. **Der Saldo hat eine Konvention, und die UI zeigt nie ein rohes Vorzeichen.** `balanceCents > 0`
    heißt „Slot 2 schuldet Slot 1"; die Web-App negiert für einen Betrachter aus Slot 2 und rendert
    einen von drei Katalogschlüsseln. Drei Schlüssel, nicht drei fest verdrahtete Sätze.
40. **`SETTLEMENT` und `OTHER_ONLY` rechnen identisch** und unterscheiden sich nur im Bericht:
    `isExpense(tx) = tx.splitMode !== 'SETTLEMENT'`. Ausgleichszahlungen sind aus Kategoriesummen, aus
    Monatsausgaben und aus „wie viel haben wir für Tiere ausgegeben" **ausgeschlossen** — sie sind
    Schuldenbewegung, kein Verbrauch. Das ist **eine** exportierte Prädikatsfunktion, kein Ad-hoc-Filter
    an jeder Aufrufstelle.
41. **Excels `SUM` überspringt Textzellen.** `H79` steht als Zeichenkette `"31,47"` im Blatt, weil
    jemand ein deutsches Dezimalkomma getippt hat — 31,47 € sind seit April 2025 unsichtbar. Der
    Importer holt sie per Default zurück; der importierte Saldo liegt damit **31,47 € über `K21`**, und
    diese Zeile ist im Report **benannt und beziffert**, niemals in einer Toleranz versteckt. Die
    Rundungs-Toleranz gilt nur für den `--excel-text-quirk`-Vergleich und liegt bei 25 Cent.
42. **Der Server schreibt Text in Datenzeilen in `households.defaultLocale`, nie in
    `requestLocale(c)`.** Sonst schreibt ein Lauf mit englischer UI dauerhaft einen englischen Satz in
    einen deutschen Datensatz. Betroffen sind genau zwei Keys: `plan.bookingDescription` und
    `plan.adjustmentDescription`. Und: **ein gespeicherter Wert wird beim Lesen nie neu übersetzt** —
    ein Kategorielabel ist UI-Copy, bis der Nutzer es umbenennt, und danach Inhalt.
43. **Ops-Ausgabe ist immer Englisch und geht nie durch den Katalog**: `console.*`, die
    env-Validierung beim Boot, alle CLI-Skripte, `Error.message`, die `accrual_runs.error`-Spalte.
    *Eine Sprache in einem Log ist ein Feature.*

**Aus dem Review gelernt (Fachlogik + Architektur, siehe git log für die Fixes)**

44. **„Diffe gegen den gebuchten Betrag" heißt: gegen den EFFEKTIVEN, nicht den ursprünglichen
    `fixed_plan`-Betrag.** `recalculatePlan` muss jede bereits existierende
    `fixed_plan_adjustment`-Zeile derselben Periode aufaddieren, bevor es den Delta gegen
    `computePlanForPeriod` bildet. Sonst produziert eine ZWEITE Gehaltskorrektur denselben
    `externalKey` wie die erste (`fixedplan-adj:{hh}:{p}:{urspr._bookedCents}`), `onConflictDoNothing`
    verschluckt sie lautlos, und die Antwort lügt: `applied: true`, `adjustments: []`. Test: zwei
    Korrekturen hintereinander, nicht nur eine (`apps/api/test/plan.test.ts`, „a SECOND retroactive
    correction").
45. **`lastBookedPeriod` darf nie über eine Periode hinweg vorrücken, die aus Datenmangel übersprungen
    wurde.** Wird sie nur bei jeder ERFOLGREICH gebuchten Periode gesetzt (statt beim ersten
    `plan_incomplete`-Skip einzufrieren), springt sie über die Lücke, sobald eine SPÄTERE Periode wieder
    bebuchbar ist — und `catchUpRange` startet danach immer NACH `lastBookedPeriod`. Die Lücke ist dann
    für immer weg, auch nachdem der Nutzer die fehlenden Item-/Income-Zeilen nachträgt: es gibt keinen
    API-Weg zurück. Die Reparatur: `lastBooked` nur vorrücken, solange in DIESEM Lauf noch kein
    `plan_incomplete`-Skip vorkam („Datenlücke" ≠ „schon anderswo gebucht" ≠ „Anteil ist zufällig 0" —
    nur Ersteres darf einfrieren).
46. **Ein `externalKey`-Namensraum-Unterschied (`fixedplan:*` vs. `xlsx:rent:*`) verhindert KEINE
    Doppelbuchung derselben Periode** — der Unique-Index ist `(household_id, external_key)`, und zwei
    verschiedene Strings für denselben Monat kollidieren dort nie. Der Catch-up-Loop UND `PATCH
    …/plan { startPeriod }` müssen deshalb explizit auf `(household_id, plan_period)` prüfen, egal
    welchen `origin` die vorhandene Zeile hat (`isPeriodBooked` in `plan.service.ts`) — sonst bucht ein
    Haushalt, der vor dem xlsx-Import existierte (`startPeriod` defaultet auf die aktuelle Periode bei
    Haushaltsanlage), seine importierte Mietserie ein zweites Mal. `plan_period_locked` (409) existierte
    als Fehlercode und Katalogschlüssel bereits, wurde aber nirgends geworfen — der tote Code WAR die
    fehlende Absicherung.
47. **Eine Idempotenzprüfung, die einen zusammengesetzten Unique-Index nachbildet, muss auf ALLEN seinen
    Spalten filtern, nicht nur der auffälligsten.** `transactions_household_external_key_uidx` ist
    `(household_id, external_key)`; `scripts/import-xlsx.ts`s Vorab-`SELECT` filterte nur auf
    `external_key`. In einer DB mit zwei Haushalten (Demo-Seed neben dem echten, oder ein zweiter
    echter Import) sieht die Prüfung die Zeilen des ERSTEN Haushalts unter denselben `xlsx:*`-Keys,
    meldet „N already present (idempotent re-run)" und schreibt für den zweiten Haushalt nichts — bei
    vollem Erfolgs-Output.
48. **Eine Zod-`.refine()` kann keinen eigenen Fehlercode auf die Leitung bringen.** Jeder
    `ZodError` wird zu `422 validation_failed` (`lib/errors.ts`s `toApiError`) — der spezifische
    Refinement-Key landet nur in `details[].i18n.key`, nie in `error.code`. Ein dokumentierter,
    dedizierter Code wie `transaction_amount_zero` muss deshalb als expliziter `throw new
    ApiError(422, "…", …)` im Service stehen, NICHT als Schema-Refinement — sonst verspricht der
    Wire-Contract einen Code, den kein Client je in `error.code` sieht (CLAUDE.md's eigene Regel „auf
    `code` branchen, nie auf `message`" wird damit für genau diesen Fall unmöglich einzuhalten).
    `settlements.service.ts`s `settlement_amount_invalid`-Check macht es bereits richtig vor.
49. **`R8` ist keine Betragszelle — ihr Wert ist die SUMME, ihre `formula` sind die sechs einzelnen
    Beträge.** `"950+150+55.00+22.50+5.00+5.00"` als Text, nicht sechs Zellen. Wer nur den
    gecachten `value` liest (wie jede andere Betragszelle im Blatt), bekommt `118750` ct total und
    verliert die sechs Einzelpositionen, aus denen `fixed_cost_items` bestehen muss — der Importer
    schrieb deshalb ursprünglich 310 Transaktionen, aber nie den Fixkostenplan selbst (leere
    `fixed_cost_items`/`incomes`, `startPeriod` nie über den Default hinaus bewegt), obwohl die Zahlen
    die ganze Zeit im Blatt standen. `parseFixedCostFormulaCents` spaltet die Formel selbst, nicht den
    Cache.
50. **`PUBLIC_API_URL` MUSS leer sein — auch in der Entwicklung —, und ein absoluter Wert dort täuscht
    einen Serverausfall vor.** Die App hat GENAU EINE Origin: im Container serviert die API die
    gebaute PWA (`WEB_DIST_DIR`), in der Entwicklung leitet Vites `server.proxy` `/api` an den
    API-Port weiter. Genau deshalb montiert `apps/api/src/index.ts` **kein `cors()`** (Entscheidung
    #7). Steht in `PUBLIC_API_URL` eine absolute URL, baut `lib/api.ts` absolute Requests, die am
    Proxy vorbei direkt auf `:3001` gehen — cross-origin, gegen einen Server ohne CORS-Header. Das
    Symptom lügt: der Server antwortet sauber mit 200/401, der Network-Tab zeigt den Body, aber der
    Browser gibt ihn nicht an JS weiter, `fetch` rejected, und die App rendert
    `common.errorOffline` („Keine Verbindung zum Server.") über einer völlig gesunden API. Genau so
    war `.env.example` ausgeliefert (`PUBLIC_API_URL="http://localhost:3001"`, während der Kommentar
    zwei Zeilen darüber „LEAVE THIS EMPTY" sagte), und damit war **jedes frische Setup beim ersten
    Öffnen kaputt** — kein Test schlug an, weil `bun test` nie durch einen Browser geht. Der Default
    ist jetzt `""`, ein Test in `apps/api/test/smoke.test.ts` pinnt das, und `lib/api.ts` schreibt im
    Dev-Modus eine erklärende `console.error`, falls die Origins auseinanderlaufen. Wer die API
    wirklich auf eine andere Origin legt, muss `cors()` mitliefern — beides hängt zusammen.

**Aus dem zweiten Review (Code-Review über die ganze Codebase)**

51. **Drizzle verpackt JEDEN Query-Fehler in einen `DrizzleQueryError`; die echte Meldung steht in
    `cause`.** `error.message` ist nur `Failed query: insert into "incomes" …`, `error.code` ist
    `undefined`, und `SQLITE_CONSTRAINT: UNIQUE constraint failed: …` liegt eine Ebene tiefer.
    `isUniqueViolation` prüfte nur die oberste Ebene und lieferte damit für **jede** Unique-Verletzung
    `false`, die dieses Repo überhaupt erzeugen kann — alle vier darauf gebauten 409er
    (`email_taken`, `category_slug_taken`, der Income-Overlap, `household_full`) fielen still auf
    einen unbehandelten **500** zurück. `POST …/plan/incomes` mit doppeltem `validFrom` antwortete
    `internal_error`. Kein Test schlug an, weil `email_taken` als einziger getestet war und die
    Register-Route die Adresse **vorher** nachschlägt und ihren eigenen catch nie erreicht. Die
    Funktion läuft jetzt die `cause`-Kette entlang (tiefenbegrenzt). Wer eine Treiber-Fehlerform
    prüft, prüft die Kette, nie nur die Spitze.
52. **Query-Keys, die hierarchisch AUSSEHEN, sind es nicht.** TanStack matcht Präfixe pro
    Array-**Element**: `["toon","household",hh,"transactions"]` trifft
    `…,"transaction-summary",…` nicht, und `…,"balance"` trifft `…,"balance-history",…` nicht.
    `invalidateAfterLedgerMutation` listete beide Nachbarn nicht auf — die Dashboard-Karten und der
    Saldo-Verlauf zeigten nach jeder Buchung bis zu 30 s alte Zahlen, während der eigene Docstring
    der Funktion behauptete, die Summary sei dabei. Ein vergessener Key wirft nichts; er zeigt
    ruhig die Zahl von gestern. `apps/web/src/lib/queries.test.ts` pinnt den Fan-out.
53. **Eine optimistische Löschung braucht ein `onError`, eine optimistische Anlage einen Filter.**
    Die DELETE-Mutation entfernte die Zeile in `onMutate` und stellte sie nie wieder her — bei
    `409 transaction_generated` (Plan-Zeilen sind nicht löschbar, und `shouldRetry` wiederholt keinen
    4xx) blieb sie aus der UI verschwunden, obwohl sie serverseitig existiert. Umgekehrt schrieb
    `patchListsWithOptimisticRow` per Präfix-Match in **jede** gecachte Listenvariante, auch in
    Kategorie-, Zeitraum- und Seite-2-Filter, die die Zeile nicht enthalten dürfen. Offline pausiert
    die Mutation, also korrigiert das niemand. Einfügen ist jetzt auf die ungefilterte erste Seite
    beschränkt, Entfernen bleibt bewusst breit. Und ein DELETE räumt den Detail-Cache per
    `removeQueries` ab, sonst rendert `/transactions/$id` die gelöschte Zeile weiter.
54. **Eine Periode mit Anteil 0 schreibt keine Zeile, rückt `lastBookedPeriod` aber trotzdem vor.**
    Damit war sie für beide Wege unsichtbar: der Catch-up startet nach `lastBookedPeriod`, und
    `recalculatePlan` iterierte über `fixed_plan`-**Zeilen**. Eine spätere Gehaltskorrektur, die den
    Anteil von 0 auf einen echten Betrag hebt, war endgültig verloren — ohne API-Weg zurück.
    Die Kandidatenmenge ist jetzt „alle Perioden mit Plan-Zeile ∪ `[startPeriod, lastBookedPeriod]`",
    und eine Periode ohne Plan-Zeile diffed gegen 0. Perioden, die einer **fremden** Herkunft
    gehören (xlsx-Miete, manuell), bleiben ausgenommen — sonst bucht die Korrektur auf den Import obendrauf.
55. **Ein angenommener Einladungstoken muss aufhören, eine Capability zu sein.**
    `loadRedeemableInvite` prüfte `revoked` und Ablauf, aber nie `accepted`. Sobald die zweite Person
    wieder austritt (`removeMember` gibt den Slot frei), setzte derselbe — noch nicht abgelaufene —
    Link eine **beliebige** dritte Person in den Haushalt. Jetzt ist ein angenommener Token nur noch
    für genau das Konto einlösbar, das ihn angenommen hat (`redeemerId`); das hält `acceptInvite`
    idempotent und macht den Link für alle anderen zu `404 invite_invalid`.
56. **Die Zeilenreihenfolge im Blatt ist NICHT chronologisch — nicht einmal auf Monatsebene.**
    Spalte A Zeilen 18/20/28 sind `Obi 02.10`, `Obi 30.09`, `Lutz 29.09`. Ein „offensichtlicher" Fix
    gegen invertierte Datumsauflösung (monotone Untergrenze pro Bracket) wurde gegen den echten
    Korpus gemessen und schob `Obi 30.09` auf 2022-09-30, mit Jahresversatz für die 18 Zeilen darunter
    und 4 verlorenen `day`-Präzisionen. Rückgängig gemacht, in `dates.ts` und im Test begründet.
    *Ein Befund kann mechanisch stimmen und von den Daten widerlegt werden — am Korpus messen, nicht
    am Modell im Kopf.*

**Aus dem Redesign (globales Erfassen-Blatt, Petrol-Palette)**

57. **`cn()` ist reines `clsx`, kein `tailwind-merge` — ein `className`, das eine Basisklasse
    überschreiben soll, gewinnt oder verliert nach Tailwinds EMIT-Reihenfolge, nicht nach der
    Reihenfolge im Attribut.** `<Card className="bg-brand">` rendert `bg-surface bg-brand`, beide mit
    gleicher Spezifität, und `bg-surface` stand später im Stylesheet: der Saldo-Hero blieb weiß,
    während `text-brand-fg` auf demselben Element durchkam. Es knallt nichts, es sieht nur falsch aus,
    und nur im Browser. Deshalb hat `Card` ein `tone` (`surface`/`brand`/`accent`) und `Button` die
    Varianten `inverse`/`inverseOutline`: eine Farbfläche wird **ausgetauscht, nie überlagert**. Wer
    eine neue braucht, erweitert das Primitive — dieselbe Falle traf auch `Skeleton`
    (`BalanceHero`s Ladezustand bleibt deshalb bewusst neutral).
58. **`querySelector("[data-autofocus], input, …, button, …")` liefert das erste Element in
    DOKUMENT-Reihenfolge, das IRGENDEINEN Zweig trifft — nicht das erste, das den ersten Zweig
    trifft.** `Dialog`s Schließen-Knopf steht im Header vor allem Inhalt, also bekam er den Fokus und
    das Erfassen-Blatt öffnete auf „X" statt auf dem Betrag. `[data-autofocus]` braucht eine
    **eigene** Abfrage davor.
59. **`AmountInput` hält einen eigenen Textpuffer; er muss dem Prop folgen, wenn die Änderung von
    AUSSEN kam.** Das Blatt bleibt nach dem Buchen offen und leert das Formular — der Puffer zeigte
    weiter „12,50", während `amountCents` schon `null` war, und „Buchen" antwortete „Bitte gib einen
    Betrag ein" über einer Zahl, die der Nutzer sieht. Verglichen wird gegen den zuletzt SELBST
    emittierten Wert, nicht gegen jedes `valueCents`: sonst schreibt der Sync „12," beim Tippen zu
    „12,00" um.
60. **`import.meta.glob("/src/features/**/*.tsx")` schluckte auch die geteilten Bausteine.** Sobald
    ein statisch importiertes Modul (der `QuickAddDialog` im App-Shell) einen davon mitzieht, meldet
    Rollup INEFFECTIVE_DYNAMIC_IMPORT. Der Glob in `lib/lazy-page.tsx` steht deshalb auf
    `"/src/features/*/*Page.tsx"` — genau die Form, die `candidates` überhaupt anfragt.
61. **Auf 390 px passen Kategorie, „Dein Anteil …", Betrag und Overflow-Trigger nicht in eine
    Zeile.** Nacheinander gaben die Kategorie („Lebens…") und dann die Beschreibung nach — beides
    Dinge, über die man eine Zeile wiederfindet. `TransactionRow` zeigt unter `sm` deshalb nur die
    nackte Anteilszahl rechts unter dem Betrag, mit dem Satz auf `aria-label`; ab `sm` steht er
    ausgeschrieben in der Meta-Zeile. Gemessen im Headless-Browser, nicht geschätzt (Gotcha 31).

**Aus dem Review des Redesigns**

62. **„Ist das Blatt offen?" ist nicht „hat das Blatt ungespeicherte Arbeit?".** `QuickAddDialog`
    behielt seinen Formularzustand über Schließen/Öffnen hinweg — genau so gewollt, ein Fehlgriff
    darf keinen getippten Betrag kosten — meldete den `useUnsavedWork`-Claim aber als
    `isOpen && form.isDirty` an. Ein geschlossenes Blatt mit getipptem Betrag gab den Claim also
    frei, `applyUpdate()` sah eine saubere Oberfläche, lud das Dokument neu, und der Betrag war weg.
    Der Claim gehört an den Zustand, nie an dessen Sichtbarkeit: `useUnsavedWork(form.isDirty)`,
    wie `/new` es von Anfang an tat.
63. **Ein einmaliger Autofokus verliert gegen Inhalt, der später ankommt.** `Dialog`s Fokus-Effekt
    hing an `[open]`. Öffnet das Erfassen-Blatt, während `useOtherMember()` noch lädt, steht dort ein
    `LoadingBlock` ohne `[data-autofocus]` — der Effekt nahm das Panel und lief nie wieder, auch nicht,
    als das Betragsfeld mountete. Der Effekt läuft jetzt nach JEDEM Render, mit zwei Refs, die ihn
    höchstens zweimal handeln lassen (einmal Fallback, einmal beim Erscheinen des echten Ziels) —
    sonst stiehlt er den Fokus jemandem, der schon tippt.
64. **Ein Trenner wird ZWISCHEN Teile gesetzt, nie an einen Teil angehängt.** `TransactionRow` schrieb
    das „·" direkt hinter das geschätzte Datum, in der Annahme, dass die Kategorie folgt. Auf 390 px
    ohne Kategorie folgte nichts (alles Weitere ist `sm`-only) und die Zeile endete auf
    `~ 21.08.2026 ·` — genau der einsame Interpunkt, den der eigene Kommentar der Komponente
    verbietet. Die Teile werden jetzt als LISTE gesammelt und beim Rendern verfugt.
65. **Zwei Rahmen, EIN Formular-Hook — aber zwei Zustände.** `/new` und das globale Blatt teilen sich
    `useCreateTransactionForm`; jeder Rahmen hält trotzdem seine eigene INSTANZ davon. Der „+", die
    Sidebar-Taste und `n` legten deshalb auf `/new` einen zweiten, unabhängigen Entwurf über den
    gerade getippten: zwei Beträge, zwei „Buchen", und keine Anzeige, welcher abgeschickt wird. `/new`
    meldet sich über `useQuickAddHostedHere()` als Host an, und alle drei Auslöser treten zurück.
    *Geteilter Code heißt nicht geteilter Zustand.*

## Verifikations-Gates

Alle vier müssen sauber sein, bevor irgendetwas „fertig" heißt:

```bash
bun install
bun run typecheck    # tsc für packages/shared, apps/api, apps/web
bun test
bun run build        # vite build + PWA
```

Es gibt **kein** `i18n:check` — die Typkonstruktion (`LocaleCatalog<typeof de>`) ist die vollständige
Durchsetzung, `bun run typecheck` ist das Gate.

Zusätzlich, bei allem, was Persistenz oder Auth berührt: `bun run db:migrate` und `bun run seed` gegen
eine frische `file:`-DB, danach der curl-Durchlauf aus der README.

Bei allem, was das Dockerfile, den Compose-Stack oder `middleware/staticWeb.ts` berührt, muss das Image
gebaut und der Stack wirklich gestartet werden — ein Dockerfile kann auf Arten falsch sein, die kein
Test fängt:

```bash
docker build -t toon-finance:local . > /tmp/build.log 2>&1; echo $?   # NICHT durch eine Pipe
docker network create toon-edge 2>/dev/null || true                   # der Stack braucht es
docker compose --env-file .env.local-stack -p toonfin up -d
```

**Ein lokaler Stack braucht jetzt auch den edge-Proxy**, sonst terminiert nichts TLS und es gibt keine
Seite zu sehen: toon-edge daneben auschecken, in dessen `.env` `FINANCE_HOSTNAME` setzen und
`TOON_TLS_ISSUER=internal` **und** `TOON_HSTS_MAX_AGE=0` DORT eintragen — mit dem `acme`-Default
bekommt ein interner Name nie ein Zertifikat, und ein gepinnter HSTS auf einem internen Namen sperrt
aus. In `.env.local-stack` dieses Repos stehen diese beiden Werte nicht mehr. Ein selbstsigniertes Zertifikat allein ergibt trotzdem **keine** PWA: ein Origin mit
nicht vertrauter CA ist auch nach dem Wegklicken kein Secure Context.
