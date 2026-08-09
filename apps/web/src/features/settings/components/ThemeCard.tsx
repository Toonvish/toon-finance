import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";

/** System / Hell / Dunkel. */
export function ThemeCard() {
  const t = useT();
  const { preference, setPreference } = useTheme();

  return (
    <Card>
      <CardHeader title={t("settings.theme.title")} />
      <Tabs<ThemePreference>
        aria-label={t("settings.theme.title")}
        value={preference}
        onChange={setPreference}
        items={[
          { value: "system", label: t("settings.theme.system") },
          { value: "light", label: t("settings.theme.light") },
          { value: "dark", label: t("settings.theme.dark") },
        ]}
      />
    </Card>
  );
}
