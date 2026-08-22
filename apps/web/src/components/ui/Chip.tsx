import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipVariant = "solid" | "dashed";

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Renders the selected state — and sets `aria-pressed`, so the state is announced, not just coloured. */
  selected?: boolean;
  /** `dashed` is the "open the full list" escape hatch ("Alle 21"), never a value. */
  variant?: ChipVariant;
  children: ReactNode;
}

/**
 * A pill-shaped single-tap choice: the date presets and the category
 * shortlist in the quick-add form (docs/spec.md §4.5).
 *
 * Chips exist so a value that used to hide behind a `<select>` or a sheet can
 * be taken in AND changed without opening anything — the whole point of the
 * redesigned capture flow. They are for short, closed, frequently-reused
 * sets; anything longer keeps its sheet behind a `dashed` chip.
 *
 * `min-h-9` (36px) is deliberately below the 44px floor the buttons keep:
 * chips come in rows of six and always sit inside a sheet whose primary
 * action is a full-height button. Never use one as a screen's main action.
 */
export function Chip({ selected = false, variant = "solid", className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={variant === "solid" ? selected : undefined}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        variant === "dashed"
          ? "border border-dashed border-line-strong font-semibold text-brand hover:border-brand"
          : selected
            ? "border-[1.5px] border-brand bg-brand-soft font-semibold text-brand-soft-fg"
            : "border border-line bg-surface font-medium text-fg-muted hover:border-line-strong hover:text-fg",
        className,
      )}
      {...rest}
    >
      <span className="max-w-52 truncate">{children}</span>
    </button>
  );
}
