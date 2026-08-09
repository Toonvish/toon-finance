import { useQuery } from "@tanstack/react-query";
import { healthQuery } from "@/lib/queries";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { Card, CardHeader } from "@/components/ui/Card";

/** Version string from `GET /api/health`, so it never drifts from what is actually deployed. */
export function AboutCard() {
  const t = useT();
  const health = useQuery(healthQuery());

  return (
    <Card>
      <CardHeader title={t("settings.about.title")} />
      <p className="text-sm text-fg-muted">{t("settings.about.version", { version: health.data?.version ?? "…" })}</p>
    </Card>
  );
}
