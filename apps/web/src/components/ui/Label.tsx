import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider.tsx";

/**
 * The small upper-case caption that sits over a field GROUP in the capture
 * form — Betrag, Art, Datum, Kategorie. Exported as a class string (the same
 * pattern as `controlClasses` in `Input.tsx`) because two of the four groups
 * label a radiogroup or a chip row rather than a single control, and a
 * `<label>` that labels nothing is worse than a `<span>`. Written out four
 * times before, once now.
 */
export const captionClasses = "block text-xs font-semibold tracking-wide text-fg-subtle uppercase";

export type LabelVariant = "default" | "caption";

const variants: Record<LabelVariant, string> = {
  default: "block text-sm font-medium text-fg",
  caption: captionClasses,
};

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Adds the "(optional)" hint instead of a required marker. */
  optional?: boolean;
  required?: boolean;
  /** `caption` = the capture form's upper-case group caption ({@link captionClasses}). */
  variant?: LabelVariant;
  children: ReactNode;
}

export function Label({ optional, required, variant = "default", className, children, ...rest }: LabelProps) {
  const t = useT();
  return (
    <label className={cn(variants[variant], className)} {...rest}>
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      ) : null}
      {optional ? <span className="ml-1 font-normal text-fg-subtle">({t("common.optional")})</span> : null}
    </label>
  );
}
