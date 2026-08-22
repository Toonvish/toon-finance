/**
 * The amount field at the top of the quick-add sheet and the edit screen
 * (docs/spec.md §4.5) — one card, the label on the left, a huge
 * right-aligned `tabular-nums` figure on the right, always positive on
 * screen. The "Erstattung / Gutschrift" switch sits beside it and is the only
 * thing that ever introduces a minus sign, so the user never types a `-`:
 * that keeps the numeric keypad purely numeric and matches how the four kind
 * tiles already read ("Ihr teilt 12,50 €", never "-12,50 €").
 *
 * The card, not the `<input>`, carries the border and the focus ring
 * (`focus-within`) — the input itself is transparent and borderless, so the
 * figure reads as the card's content instead of as a form control.
 *
 * Parsing goes through `parseGermanAmount` from `@toon/shared` — the same
 * function the CLI importer's tests exercise — so `"1.234,56"` / `"1234,56"`
 * / `"1234.56"` all resolve to the identical integer cents. Never
 * `parseFloat`.
 */
import { useId, useState } from "react";
import { parseGermanAmount } from "@toon/shared";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { Switch } from "@/components/ui/Switch";

export interface AmountInputProps {
  /** Signed cents, or `null` while the field is empty/unparsable. */
  valueCents: number | null;
  onChange: (cents: number | null) => void;
  error?: string | undefined;
  id?: string;
  autoFocus?: boolean;
}

/** `12345` -> `"123,45"` (no thousands separator, no currency sign — this is an EDIT buffer, not display text). */
function absoluteToEditText(cents: number): string {
  const sign = cents < 0 ? -1 : 1;
  const absolute = cents * sign;
  const euros = Math.floor(absolute / 100);
  const rest = String(absolute % 100).padStart(2, "0");
  return `${euros},${rest}`;
}

export function AmountInput({ valueCents, onChange, error, id: idProp, autoFocus }: AmountInputProps) {
  const t = useT();
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const describedBy = error ? `${id}-error` : undefined;

  // The text buffer holds only the UNSIGNED amount as typed — the credit
  // toggle is the only thing that ever introduces a minus sign, so retyping
  // never has to fight a sign the user did not enter.
  const [text, setText] = useState(() => (valueCents !== null ? absoluteToEditText(valueCents) : ""));

  /*
   * The last value THIS field handed upwards. When `valueCents` differs from
   * it, the change came from somewhere else — the quick-add sheet clearing
   * itself after a booking, or the edit screen prefilling — and the buffer
   * has to follow, or the field shows an amount the form no longer holds.
   * That gap is not cosmetic: after a booking the sheet stays open, so
   * "12,50" sat on screen next to a `null` state, and pressing "Buchen"
   * answered "Bitte gib einen Betrag ein" about a number the user could see.
   *
   * Comparing against the last EMITTED value (rather than syncing on every
   * `valueCents` change) is what keeps typing intact: "12," parses to 1200,
   * and a naive sync would rewrite the buffer to "12,00" under the cursor.
   */
  const [emitted, setEmitted] = useState<number | null>(valueCents);
  if (valueCents !== emitted) {
    setEmitted(valueCents);
    setText(valueCents !== null ? absoluteToEditText(valueCents) : "");
  }

  const isCredit = valueCents !== null && valueCents < 0;

  function commit(nextText: string, nextIsCredit: boolean) {
    setText(nextText);
    const parsed = nextText.trim() === "" ? null : parseGermanAmount(nextText);
    const cents = parsed === null ? null : nextIsCredit ? -Math.abs(parsed) : Math.abs(parsed);
    setEmitted(cents);
    onChange(cents);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-card border bg-surface px-4 py-3",
            "transition-colors duration-150 focus-within:border-brand focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-brand/40",
            error ? "border-danger" : "border-line",
          )}
        >
          <label htmlFor={id} className="shrink-0 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
            {t("transactions.form.amount")}
          </label>
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            autoFocus={autoFocus}
            data-autofocus={autoFocus ? "" : undefined}
            placeholder={t("transactions.form.amountPlaceholder")}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={text}
            onChange={(event) => commit(event.currentTarget.value, isCredit)}
            className={cn(
              "min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-3xl leading-none font-semibold tracking-tight sm:text-4xl",
              "text-fg tabular-nums outline-none placeholder:font-normal placeholder:text-fg-subtle",
            )}
          />
          <span aria-hidden="true" className="shrink-0 text-2xl leading-none font-medium text-fg-subtle">
            €
          </span>
        </div>

        <Switch
          checked={isCredit}
          onChange={(checked) => commit(text, checked)}
          label={t("transactions.form.credit")}
          className="shrink-0 rounded-card border border-line bg-surface px-4 py-2 sm:w-56"
        />
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : isCredit ? (
        <p className="text-xs text-fg-muted">{t("transactions.form.creditHint")}</p>
      ) : null}
    </div>
  );
}
