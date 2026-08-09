import { WifiOff } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useOnlineStatus, usePendingSyncCount } from "@/lib/pwa";

/**
 * Slim, always-visible hint while the device has no connection, OR while a
 * booking made offline is still queued for delivery ([OFFLINE] —
 * `usePendingSyncCount`, `lib/pwa.ts`). The two conditions are independent:
 * a queue can outlive the outage by a few seconds while
 * `resumePausedMutations()` catches up after reconnect, and that moment is
 * exactly when "wird automatisch nachgereicht" needs to still be visible.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const pendingCount = usePendingSyncCount();
  const t = useT();
  if (online && pendingCount === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning-soft px-3 py-1.5 text-center text-xs font-medium text-warning-soft-fg"
    >
      {!online ? (
        <span className="flex items-center gap-2">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          {t("common.offlineBanner")}
        </span>
      ) : null}
      {pendingCount > 0 ? <span>{t("common.syncPending", { count: pendingCount })}</span> : null}
    </div>
  );
}
