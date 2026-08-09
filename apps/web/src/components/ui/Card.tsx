import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `none` when the card contains a full-bleed list. */
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds hover/active feedback for cards that are links or buttons. */
  interactive?: boolean;
  /** Render as another element, e.g. `as="li"` inside a list. */
  as?: "div" | "section" | "article" | "li";
}

const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-5 sm:p-6" } as const;

export function Card({ padding = "md", interactive = false, as = "div", className, children, ...rest }: CardProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      className={cn(
        "rounded-card border border-line bg-surface text-fg shadow-card",
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
