import type { NamespaceCatalog } from "@toon/shared";

/**
 * `balance` — the balance never renders a raw sign; it always goes through
 * `balance.owesYou` / `balance.youOwe` / `balance.settled` (docs/spec.md §3.8).
 */
export const balanceDe = {
  "balance.title": "Saldo",
  "balance.owesYou": "{name} schuldet dir {amount}",
  "balance.youOwe": "Du schuldest {name} {amount}",
  "balance.settled": "Ausgeglichen",
  "balance.asOf": "Stand {date}",
  "balance.details": "Details",
  "balance.breakdown.title": "Woraus der Saldo besteht",
  "balance.breakdown.split": "Geteilte Ausgaben",
  "balance.breakdown.forOther": "Für {name} bezahlt",
  "balance.breakdown.settled": "Bereits ausgeglichen",
  "balance.breakdown.count": { one: "aus 1 Buchung", other: "aus {count} Buchungen" },
  "balance.settle.action": "Jetzt ausgleichen",
  "balance.settle.title": "Ausgleichszahlung",
  "balance.settle.full": "Vollständig ausgleichen ({amount})",
  "balance.settle.partial": "Anderer Betrag",
  "balance.settle.amount": "Betrag",
  "balance.settle.direction": "{from} zahlt an {to}",
  "balance.settle.note": "Notiz",
  "balance.settle.notePlaceholder": "z. B. Überweisung vom 09.08.",
  "balance.settle.submit": "Ausgleich buchen",
  "balance.settle.overpayHint": "Mehr als der Saldo — danach schuldet {name} dir Geld.",
  "balance.settle.stale": "Der Saldo hat sich gerade geändert. Er steht jetzt bei {amount}.",
  "balance.settle.staleAction": "Neu laden und weiter",
  "balance.settle.done": "Ausgleich gebucht.",
  "balance.month.title": "Dieser Monat",
  "balance.month.total": "Ausgaben",
  "balance.month.delta": "{amount} gegenüber dem Vormonat",
  "balance.month.count": { one: "1 Buchung", other: "{count} Buchungen" },
  "balance.byCategory.title": "Ausgaben nach Kategorie",
  "balance.byCategory.other": "Sonstige",
  "balance.byCategory.none": "Ohne Kategorie",
  "balance.byCategory.empty": "In diesem Zeitraum gibt es keine Ausgaben.",
  "balance.recent.title": "Zuletzt erfasst",
  "balance.recent.all": "Alle Buchungen",
  "balance.history.title": "Verlauf",
  "balance.history.hideAggregates": "Sammelbuchungen ausblenden",
} as const satisfies NamespaceCatalog<"balance">;

export type BalanceCatalog = typeof balanceDe;
