import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "neutral" | "brand" | "success" | "warning" | "danger";
export type BadgeSize = "sm" | "md";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-fg-muted",
  brand: "bg-brand-soft text-brand-soft-fg",
  success: "bg-success-soft text-success-soft-fg",
  warning: "bg-warning-soft text-warning-soft-fg",
  danger: "bg-danger-soft text-danger-soft-fg",
};

const sizes: Record<BadgeSize, string> = {
  // Real steps only: `text-xs` (12px) for the small count, the shared
  // `--text-control` step for `md` so a badge and a button read at the same size.
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-control",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
}

/** Used for `categories.system`, `KindBadge` (origin/kind) and small counts. */
export function Badge({ variant = "neutral", size = "md", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium whitespace-nowrap [&_svg]:size-3.5",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
