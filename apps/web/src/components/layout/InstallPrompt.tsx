import { Share2, Smartphone, X } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useInstallPrompt } from "@/lib/pwa";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

/**
 * "Zum Startbildschirm hinzufügen" banner.
 * Chromium/Android: triggers the native install prompt.
 * iOS Safari (no prompt event): explains the Teilen -> Zum Home-Bildschirm route.
 * Dismissal is remembered for 14 days.
 */
export function InstallPrompt() {
  const install = useInstallPrompt();
  const t = useT();

  if (!install.shouldShow) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-card border border-brand/30 bg-brand-soft p-3 text-brand-soft-fg">
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("common.installTitle")}</p>
        {install.canPrompt ? (
          <>
            <p className="mt-0.5 text-sm opacity-90">{t("common.installHint")}</p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                void install.promptInstall();
              }}
            >
              {t("common.installAction")}
            </Button>
          </>
        ) : (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm opacity-90">
            {t("common.installHint")}
            <Share2 className="inline size-4" aria-hidden="true" />
          </p>
        )}
      </div>
      <IconButton label={t("common.close")} icon={<X />} size="sm" onClick={install.dismiss} className="-mt-1 -mr-1" />
    </div>
  );
}
