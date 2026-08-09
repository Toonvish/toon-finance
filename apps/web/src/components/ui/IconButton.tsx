import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type IconButtonVariant = "ghost" | "surface" | "brand" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

const variants: Record<IconButtonVariant, string> = {
  ghost: "text-fg hover:bg-surface-2",
  surface: "bg-surface border border-line text-fg hover:bg-surface-2",
  brand: "bg-brand text-brand-fg hover:bg-brand-hover shadow-soft",
  danger: "text-danger hover:bg-danger-soft",
};

const sizes: Record<IconButtonSize, string> = {
  sm: "size-9 [&_svg]:size-4",
  md: "size-11 [&_svg]:size-5",
  lg: "size-13 [&_svg]:size-6",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Required: becomes aria-label + title. Icon-only controls need a name. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", loading = false, className, disabled, type = "button", ...rest },
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
        "inline-flex shrink-0 items-center justify-center rounded-xl transition-colors duration-150",
        "active:scale-95 disabled:pointer-events-none disabled:opacity-55",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
