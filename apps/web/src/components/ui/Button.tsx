import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "inverse" | "inverseOutline";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 " +
  "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg shadow-soft hover:bg-brand-hover",
  secondary: "bg-surface-2 text-fg hover:bg-line",
  outline: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-danger text-danger-fg shadow-soft hover:bg-danger-hover",
  /*
   * The two variants for buttons sitting ON a brand-filled surface (the
   * balance hero, `Card tone="brand"`). They swap `--brand` and `--brand-fg`,
   * so they invert with the theme instead of hard-coding white — in dark mode
   * the hero is light petrol and these become dark, which is what keeps them
   * legible.
   *
   * They exist as VARIANTS rather than as a `className` override for the same
   * reason `Card` grew a `tone`: `cn()` is plain clsx, so an override of
   * `background-color` loses or wins by Tailwind's emit order, not by intent.
   */
  inverse: "bg-brand-fg text-brand hover:bg-brand-fg/90",
  inverseOutline: "border border-brand-fg/35 text-brand-fg hover:bg-brand-fg/10",
};

/** Every size keeps a >=44px touch target except `sm`, which is for dense toolbars. */
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-[0.95rem]",
  lg: "min-h-13 px-5 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks. */
  loading?: boolean;
  /** Stretches to the container width — the default for mobile forms. */
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/** Class list of a button, e.g. for `<Link className={buttonClasses({variant:"primary"})}>`. */
export function buttonClasses(
  options: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string } = {},
): string {
  const { variant = "primary", size = "md", fullWidth, className } = options;
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
