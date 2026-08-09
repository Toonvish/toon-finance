/**
 * German — the SERVER catalog (`apps/api` + `packages/shared`: error
 * messages, Zod validation messages, mail copy). `packages/shared` is the
 * right home because both the API and the browser run the Zod schemas that
 * produce these keys (client-side validation reuses `resolveZodIssue`).
 *
 * Every text below is copied verbatim from docs/spec.md §6.10/§6.11 — no text
 * is invented or reworded here.
 */
import type { NamespaceCatalog } from "../types.ts";

export const serverDe = {
  /* -------------------------- ApiError defaults -------------------------- */
  "server.error.badRequest": "Ungültige Anfrage",
  "server.error.unauthorized": "Bitte melde dich an.",
  "server.error.invalidCredentials": "E-Mail oder Passwort stimmt nicht.",
  "server.error.forbidden": "Dazu hast du keine Berechtigung.",
  "server.error.notFound": "Nicht gefunden",
  "server.error.routeUnknown": "Unbekannter Endpunkt: {method} {path}",
  "server.error.conflict": "Das steht im Widerspruch zum aktuellen Stand.",
  "server.error.internal": "Unerwarteter Fehler. Bitte versuch es später noch einmal.",
  "server.error.requestFailed": "Die Anfrage ist fehlgeschlagen.",
  "server.error.tooManyAttempts": "Zu viele Versuche. Bitte in {seconds} Sekunden erneut probieren.",

  /* --------------------------------- auth --------------------------------- */
  "server.auth.emailTaken": "Zu dieser E-Mail-Adresse gibt es bereits ein Konto.",
  "server.auth.invalidJsonBody": "Der Anfrage-Body ist kein gültiges JSON.",
  "server.auth.passwordRequired": "Bitte gib dein aktuelles Passwort ein.",
  "server.auth.resetTokenInvalid": "Dieser Link ist ungültig oder abgelaufen.",

  /* ----------------------------- household -------------------------------- */
  "server.household.noAccess": "Dieser Haushalt gehört nicht zu deinem Konto.",
  "server.household.required": "Du gehörst noch zu keinem Haushalt.",
  "server.household.full": "Dieser Haushalt hat bereits zwei Mitglieder.",
  "server.household.memberHasLedger": "Zu dieser Person gibt es noch Buchungen. Sie müssen zuerst entfernt werden.",

  /* -------------------------------- invite --------------------------------- */
  "server.invite.invalid": "Diese Einladung ist ungültig oder bereits eingelöst.",
  "server.invite.expired": "Diese Einladung ist abgelaufen.",

  /* ----------------------------- transaction -------------------------------- */
  "server.transaction.amountZero": "Der Betrag darf nicht 0 sein.",
  "server.transaction.generated": "Diese Buchung stammt aus dem Fixkostenplan und lässt sich nicht ändern.",
  "server.transaction.notFound": "Diese Buchung gibt es nicht.",

  /* -------------------------------- balance --------------------------------- */
  "server.balance.stale": "Der Saldo hat sich geändert. Er steht jetzt bei {amount}.",

  /* ------------------------------ settlement --------------------------------- */
  "server.settlement.amountInvalid": "Der Ausgleichsbetrag muss größer als 0 sein.",

  /* ------------------------------- category ---------------------------------- */
  "server.category.system": "Diese Kategorie gehört zum System und lässt sich nicht ändern.",
  "server.category.inUse": "An dieser Kategorie hängen noch {count} Buchungen.",
  "server.category.slugTaken": "Diese Kategorie gibt es bereits.",

  /* ------------------------- category names (write/read-time) ---------------- */
  // Rendered by [API-DOMÄNE]'s services/categories/categories.service.ts in the
  // NEGOTIATED request locale (never households.defaultLocale — a category
  // label is read-time UI copy, not a stored fact, until customLabel is set;
  // see CLAUDE.md gotcha #41). Byte-identical with the WEB catalog's
  // `categories.name.<slug>` (docs/spec.md §6.6): this lives here too because
  // apps/api cannot import from apps/web.
  "server.category.name.tiere": "Tiere",
  "server.category.name.miete": "Miete",
  "server.category.name.nebenkosten": "Nebenkosten",
  "server.category.name.fixkosten": "Fixkosten",
  "server.category.name.versicherung": "Versicherungen",
  "server.category.name.steuern_abgaben": "Steuern & Abgaben",
  "server.category.name.baumarkt": "Baumarkt & Renovierung",
  "server.category.name.moebel_wohnen": "Möbel & Wohnen",
  "server.category.name.elektronik": "Elektronik",
  "server.category.name.lebensmittel": "Lebensmittel",
  "server.category.name.haushalt_kueche": "Haushalt & Küche",
  "server.category.name.drogerie": "Drogerie & Pflege",
  "server.category.name.kleidung": "Kleidung & Accessoires",
  "server.category.name.spiele_medien": "Spiele & Medien",
  "server.category.name.hobby_kreativ": "Hobby & Kreativ",
  "server.category.name.mobilitaet": "Mobilität",
  "server.category.name.reisen": "Reisen",
  "server.category.name.freizeit": "Freizeit & Ausgehen",
  "server.category.name.geschenke": "Geschenke & Spenden",
  "server.category.name.ausgleich": "Ausgleich & Rückzahlung",
  "server.category.name.sonstiges": "Sonstiges",

  /* ---------------------------------- tag ------------------------------------- */
  "server.tag.nameTaken": "Diesen Tag gibt es bereits.",

  /* --------------------------------- plan -------------------------------------- */
  "server.plan.disabled": "Der Fixkostenplan ist nicht aktiv.",
  "server.plan.incomplete": "Für die Berechnung fehlen Fixkosten oder ein Einkommen.",
  "server.plan.periodLocked": "Für diesen Monat gibt es bereits eine Buchung.",
  "server.plan.periodOutOfRange": "Dieser Monat liegt außerhalb des Planzeitraums.",
  "server.plan.incomeOverlap": "Für diese Person gibt es schon ein Einkommen ab diesem Monat.",

  /* ----------------------------- household (extra) ----------------------------- */
  // Distinct from server.household.required (no household at all): this fires
  // when a THEIRS_SPLIT/TRANSFER row is attempted before a second member has
  // joined — there is no "other person" yet to resolve kindToStorage against.
  "server.household.needsSecondMember": "Für diese Buchungsart braucht der Haushalt ein zweites Mitglied.",

  /* ------------------------------- content (write-time) --------------------------- */
  // Rendered in `households.defaultLocale` at write time by
  // services/households/households.service.ts, never in `requestLocale(c)` —
  // see CLAUDE.md gotcha #41. Byte-identical with the WEB catalog's
  // `settings.household.defaultName` (docs/spec.md §6.9): this is the one
  // piece of UI copy the server itself has to render, before any client ever
  // asks for a locale.
  "server.content.householdDefaultName": "Unser Haushalt",
  // Byte-identical with the WEB catalog's `plan.bookingDescription` /
  // `plan.adjustmentDescription` (docs/spec.md §6.7, ledger-spec.md §4.3/§4.6).
  // Rendered by services/plan/accrual.service.ts in households.defaultLocale
  // at booking time, then stored as plain description text — never
  // re-translated on read (CLAUDE.md gotcha #41).
  "server.content.planBookingDescription": "Fixkostenanteil {period}",
  "server.content.planAdjustmentDescription": "Korrektur Fixkostenanteil {period}",
  // The default `description` of a POST .../settlements transaction when the
  // caller sends no `note`. Same write-time-locale rule as the two keys above.
  "server.content.settlementDescription": "Ausgleichszahlung",

  /* --------------------------------- mail --------------------------------------- */
  "server.mail.inviteSubject": 'Einladung in den Haushalt „{household}"',
  "server.mail.inviteBody":
    '{name} lädt dich ein, den Haushalt „{household}" mitzuführen. Über diesen Link trittst du bei: {url} — der Link gilt 14 Tage.',
  "server.mail.resetSubject": "Passwort zurücksetzen",
  "server.mail.resetBody":
    "Über diesen Link setzt du dein Passwort neu: {url} — der Link gilt eine Stunde. Wenn du das nicht angefordert hast, ignorier diese E-Mail.",

  /* ------------------------------- validation (Zod) ------------------------------ */
  "server.zod.fallback": "Diese Eingabe ist ungültig.",
  "server.zod.invalid_type": "Ungültiger Wert.",
  "server.zod.invalid_type.required": "Dieses Feld ist erforderlich.",
  "server.zod.too_small.string": "Mindestens {minimum} Zeichen.",
  "server.zod.too_small.number": "Mindestens {minimum}.",
  "server.zod.too_big.string": "Höchstens {maximum} Zeichen.",
  "server.zod.too_big.number": "Höchstens {maximum}.",
  "server.zod.invalid_format.email": "Bitte gib eine gültige E-Mail-Adresse ein.",
  "server.zod.invalid_format.uuid": "Ungültige Kennung.",
  "server.zod.invalid_enum": "Ungültige Auswahl.",
  "server.zod.field.password.too_small": "Das Passwort braucht mindestens {minimum} Zeichen.",
  "server.zod.field.email.invalid_format": "Bitte gib eine gültige E-Mail-Adresse ein.",
  "server.zod.field.amountCents.invalid_type": "Bitte gib einen Betrag ein.",
  "server.zod.field.description.too_small": "Bitte beschreib die Buchung kurz.",
  "server.zod.field.description.too_big": "Die Beschreibung ist zu lang (höchstens {maximum} Zeichen).",

  /* ------------------------------- validation (custom) ---------------------------- */
  "server.validation.periodFormat": "Bitte gib einen Monat im Format JJJJ-MM an.",
  "server.validation.amountNotZero": "Der Betrag darf nicht 0 sein.",
  "server.validation.amountPositive": "Der Betrag muss größer als 0 sein.",
  "server.validation.periodRange": "Das Ende darf nicht vor dem Beginn liegen.",
} as const satisfies NamespaceCatalog<"server">;

export type ServerCatalog = typeof serverDe;
export type ServerKey = keyof ServerCatalog;
