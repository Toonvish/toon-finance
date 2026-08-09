import { RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useAppUpdate } from "@/lib/pwa";

/**
 * Offers the reload when a new version is waiting AND something on screen is
 * unsaved.
 *
 * It is deliberately quiet the rest of the time: with nothing unsaved,
 * `lib/pwa.ts` swaps the version straight away, so there is nothing to ask
 * about and this renders null. No dismiss button — dismissing would leave
 * the app on a version it knows is stale with no way back to the offer;
 * saving or discarding the edits applies the update by itself.
 */
export function UpdateBanner() {
  const { ready, unsavedWork, apply } = useAppUpdate();
  const t = useT();
  if (!ready || !unsavedWork) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-brand-soft px-3 py-2 text-center text-xs font-medium text-brand-soft-fg"
    >
      <span className="flex items-center gap-2">
        <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
        {t("common.updateAvailable")}
      </span>
      <button
        type="button"
        onClick={apply}
        className="rounded-lg border border-brand/40 bg-surface px-2.5 py-1 font-semibold text-brand hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("common.updateApply")}
      </button>
    </div>
  );
}
