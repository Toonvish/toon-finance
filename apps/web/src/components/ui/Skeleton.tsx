import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider.tsx";

export interface SkeletonProps {
  className?: string;
  /** Renders `lines` stacked bars with a shorter last line. */
  lines?: number;
  rounded?: "sm" | "md" | "full" | "card";
}

const radii = { sm: "rounded", md: "rounded-lg", full: "rounded-full", card: "rounded-card" } as const;

export function Skeleton({ className, lines, rounded = "md" }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className={cn("h-4 animate-skeleton bg-skeleton", radii[rounded], index === lines - 1 && "w-2/3", className)}
          />
        ))}
      </div>
    );
  }
  return <div aria-hidden="true" className={cn("h-4 animate-skeleton bg-skeleton", radii[rounded], className)} />;
}

/** Placeholder rows for a transaction/plan list while it loads. */
export function SkeletonList({ count = 6 }: { count?: number }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
