import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider.tsx";

export interface SpinnerProps {
  /** sm = inline with text, md = buttons, lg = full page */
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Screen-reader label. Defaults to the catalog's "loading" copy. Pass "" to suppress it (e.g. inside a Button that already announces `aria-busy`). */
  label?: string;
}

const sizes = { sm: "size-4", md: "size-5", lg: "size-8" } as const;

export function Spinner({ size = "md", className, label }: SpinnerProps) {
  const t = useT();
  const resolvedLabel = label ?? t("common.loading");
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center", className)}>
      <LoaderCircle className={cn(sizes[size], "animate-spin")} aria-hidden="true" />
      {resolvedLabel ? <span className="sr-only">{resolvedLabel}</span> : null}
    </span>
  );
}

/** Centered spinner for route-level and section-level loading states. */
export function LoadingBlock({ label }: { label?: string }) {
  const t = useT();
  const resolvedLabel = label ?? t("common.loading");
  return (
    <div className="flex min-h-48 w-full flex-col items-center justify-center gap-3 py-12 text-fg-muted">
      <Spinner size="lg" label={resolvedLabel} />
      <p className="text-sm">{resolvedLabel}</p>
    </div>
  );
}

/** Full-screen loader used while the session bootstrap runs. */
export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-bg">
      <LoadingBlock label={label} />
    </div>
  );
}
