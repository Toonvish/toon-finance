import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A card's surface colour, and the ONLY supported way to change it.
 *
 * Passing `bg-brand` through `className` does not reliably work: `cn()` is
 * plain `clsx`, so both `bg-surface` and the override end up on the element
 * with equal specificity, and which one wins is decided by Tailwind's emit
 * order — not by the order of the class attribute. It silently lost, and the
 * balance hero rendered white for exactly that reason.
 *
 * `brand` is the balance hero and nothing else; `accent` is the fixed-cost
 * plan and nothing else (styles/theme.css).
 */
export type CardTone = "surface" | "brand" | "accent";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `none` when the card contains a full-bleed list. */
  padding?: "none" | "sm" | "md" | "lg";
  tone?: CardTone;
  /** Adds hover/active feedback for cards that are links or buttons. */
  interactive?: boolean;
  /** Render as another element, e.g. `as="li"` inside a list. */
  as?: "div" | "section" | "article" | "li";
}

const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-5 sm:p-6" } as const;

const tones: Record<CardTone, string> = {
  surface: "border-line bg-surface text-fg",
  brand: "border-transparent bg-brand text-brand-fg",
  accent: "border-accent-line bg-accent-soft text-fg",
};

export function Card({
  padding = "md",
  tone = "surface",
  interactive = false,
  as = "div",
  className,
  children,
  ...rest
}: CardProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      className={cn(
        "rounded-card border shadow-card",
        tones[tone],
        paddings[padding],
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-150 hover:border-line-strong hover:shadow-pop active:scale-[0.995]",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
