import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "./Label";

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  /** Validation message — replaces the hint and colours the control. */
  error?: string | undefined;
  required?: boolean;
  optional?: boolean;
  className?: string;
  /**
   * Render function receiving the ids to wire up:
   * `<Field label="Betrag">{(p) => <AmountInput {...p} />}</Field>`
   */
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
  }) => ReactNode;
}

/**
 * Label + control + hint/error with correct aria wiring.
 * Most screens can just use `<Input label=… error=… />`; use `Field` for a
 * custom control (e.g. `AmountInput`, `KindPicker`).
 */
export function Field({ label, hint, error, required, optional, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <Label htmlFor={id} required={required} optional={optional}>
          {label}
        </Label>
      ) : null}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
