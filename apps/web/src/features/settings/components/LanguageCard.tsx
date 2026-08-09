import { useLocalePreference, useT } from "@/lib/i18n/I18nProvider.tsx";
import type { LocalePreference } from "@/lib/i18n/locale.ts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";

/**
 * System / Deutsch / English. The two language names are AUTONYMS and
 * byte-identical in both catalogs (docs/spec.md §6.9) — whoever switches to
 * a language they cannot read still recognises their own language's name.
 */
export function LanguageCard() {
  const t = useT();
  const { preference, setPreference } = useLocalePreference();

  return (
    <Card>
      <CardHeader title={t("settings.language.title")} />
      <Tabs<LocalePreference>
        aria-label={t("settings.language.title")}
        value={preference}
        onChange={setPreference}
        items={[
          { value: "system", label: t("settings.language.system") },
          { value: "de", label: t("settings.language.de") },
          { value: "en", label: t("settings.language.en") },
        ]}
      />
    </Card>
  );
}
