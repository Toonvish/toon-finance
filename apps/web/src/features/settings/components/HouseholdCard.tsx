import { Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useHousehold } from "@/lib/session";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

/**
 * `/settings` — the ONLY mobile way to reach `/household` (docs/spec.md
 * §4.1: below `lg` there is no sidebar, so this card is what makes the
 * invite flow reachable on a phone at all).
 */
export function HouseholdCard() {
  const t = useT();
  const { household } = useHousehold();

  return (
    <Card>
      <CardHeader title={t("settings.household.title")} description={household?.name} />
      <Link to="/household" className={buttonClasses({ variant: "secondary", fullWidth: true })}>
        {t("settings.household.manage")}
      </Link>
    </Card>
  );
}
