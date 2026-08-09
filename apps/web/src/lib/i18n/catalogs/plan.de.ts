import type { NamespaceCatalog } from "@toon/shared";

/**
 * `plan.bookingDescription` and `plan.adjustmentDescription` are the only two
 * keys here the SERVER also renders (into `transactions.description`, in
 * `households.defaultLocale`, docs/spec.md §6.7) — the web app renders them
 * like any other key otherwise.
 */
export const planDe = {
  "plan.title": "Fixkostenplan",
  "plan.description":
    "Aus euren Einkommen und den festen Kosten wird jeden Monat automatisch der Anteil von {name} gebucht.",
  "plan.enabled": "Plan aktiv",
  "plan.disabledHint": "Der Fixkostenplan ist aus. Trag Fixkosten und Einkommen ein, dann kann er buchen.",
  "plan.setup": "Fixkosten einrichten",
  "plan.payer": "Wer zahlt die Fixkosten?",
  "plan.startPeriod": "Erste Buchung ab",
  "plan.costTotal": "Fixkosten gesamt",
  "plan.incomeTotal": "Einkommen gesamt",
  "plan.quote": "Quote",
  "plan.quoteHint": "{cost} von {income} — {percent} des gemeinsamen Einkommens.",
  "plan.shareOther": "{name} zahlt",
  "plan.sharePayer": "{name} trägt",
  "plan.sharePayerYou": "Du trägst",
  "plan.monthly": "Monatsanteil",
  "plan.nextBooking": "Nächste Buchung: {period}",
  "plan.lastBooked": "Zuletzt gebucht: {period}",
  "plan.pendingNotice": {
    one: "1 Monat ist noch nicht gebucht.",
    other: "{count} Monate sind noch nicht gebucht.",
  },
  "plan.run": "Jetzt buchen",
  "plan.toast.run": { one: "1 Monat gebucht.", other: "{count} Monate gebucht." },
  "plan.toast.nothingToDo": "Alles bereits gebucht.",
  "plan.items.title": "Fixkosten",
  "plan.items.add": "Position hinzufügen",
  "plan.items.label": "Bezeichnung",
  "plan.items.amount": "Betrag pro Monat",
  "plan.items.activeFrom": "Gültig ab",
  "plan.items.activeTo": "Gültig bis",
  "plan.items.open": "offen",
  "plan.items.validity": "{from} bis {to}",
  "plan.items.validityOpen": "ab {from}",
  "plan.items.supersedeHint":
    "Betrag geändert? Beende die alte Position und leg eine neue an — so bleibt jeder Monat nachvollziehbar.",
  "plan.items.supersede": "Alte Position beenden und neue anlegen",
  "plan.items.empty": "Noch keine Fixkosten eingetragen.",
  "plan.incomes.title": "Einkommen",
  "plan.incomes.add": "Einkommen hinzufügen",
  "plan.incomes.person": "Person",
  "plan.incomes.amount": "Netto pro Monat",
  "plan.incomes.validFrom": "Gültig ab",
  "plan.incomes.validTo": "Gültig bis",
  "plan.incomes.empty": "Für mindestens eine Person fehlt das Einkommen.",
  "plan.periods.title": "Gebuchte Monate",
  "plan.periods.pending": "offen",
  "plan.periods.empty": "Noch nichts gebucht.",
  "plan.recalculate.title": "Neuberechnung",
  "plan.recalculate.description":
    "Prüft alle gebuchten Monate gegen die heutigen Daten. Gebuchte Monate werden nie geändert — Abweichungen entstehen als Korrekturbuchung.",
  "plan.recalculate.preview": "Vorschau berechnen",
  "plan.recalculate.period": "Monat",
  "plan.recalculate.booked": "gebucht",
  "plan.recalculate.recomputed": "neu berechnet",
  "plan.recalculate.delta": "Differenz",
  "plan.recalculate.total": "Summe der Korrekturen",
  "plan.recalculate.confirm": "Korrekturen buchen",
  "plan.recalculate.none": "Keine Abweichung. Alle gebuchten Monate stimmen.",
  "plan.recalculate.done": {
    one: "1 Korrektur gebucht.",
    other: "{count} Korrekturen gebucht.",
  },
  "plan.lastRun": "Letzter Lauf: {date}",
  "plan.lastRunResult": "{booked} gebucht, {skipped} übersprungen",
  "plan.error.incomplete":
    "Für diese Berechnung fehlen Angaben: mindestens eine Fixkostenposition und für beide Personen ein Einkommen.",
  "plan.error.disabled": "Der Fixkostenplan ist nicht aktiv.",
  "plan.bookingDescription": "Fixkostenanteil {period}",
  "plan.adjustmentDescription": "Korrektur Fixkostenanteil {period}",
} as const satisfies NamespaceCatalog<"plan">;

export type PlanCatalog = typeof planDe;
