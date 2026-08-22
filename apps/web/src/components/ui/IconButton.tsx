import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type IconButtonVariant = "ghost" | "surface" | "brand" | "danger";
export type IconButtonSize = "sm" | "md" | "lg" | "fab";
export type IconButtonShape = "square" | "circle";

/**
 * COLOUR only — the elevation belongs to the size, because the two conflict:
 * `cn()` is plain clsx, so a `shadow-*` handed in through `className` wins or
 * loses against a variant's own shadow by Tailwind's emit order rather than by
 * intent (CLAUDE.md gotcha #57). A brand fill therefore never carries a
 * shadow of its own, and the floating "+" gets `shadow-fab` from `size="fab"`.
 */
const variants: Record<IconButtonVariant, string> = {
  ghost: "text-fg hover:bg-surface-2",
  surface: "bg-surface border border-line text-fg hover:bg-surface-2",
  brand: "bg-brand text-brand-fg hover:bg-brand-hover",
  danger: "text-danger hover:bg-danger-soft",
};

const sizes: Record<IconButtonSize, string> = {
  sm: "size-9 [&_svg]:size-4",
  md: "size-11 [&_svg]:size-5",
  lg: "size-13 [&_svg]:size-6",
  /** The floating "Erfassen" button: bigger than any toolbar control, and lifted off the page. */
  fab: "size-14 shadow-fab [&_svg]:size-7",
};

const shapes: Record<IconButtonShape, string> = {
  square: "rounded-xl",
  circle: "rounded-full",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Required: becomes aria-label + title. Icon-only controls need a name. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  shape?: IconButtonShape;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = "ghost",
    size = "md",
    shape = "square",
    loading = false,
    className,
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
      aria-label={label}
      title={label}
      disabled={disabled ?? loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-colors duration-150",
        "active:scale-95 disabled:pointer-events-none disabled:opacity-55",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        shapes[shape],
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="" /> : icon}
    </button>
  );
});
