import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useLogout } from "@/lib/session";
import { AboutCard } from "./components/AboutCard";
import { HouseholdCard } from "./components/HouseholdCard";
import { LanguageCard } from "./components/LanguageCard";
import { PasswordCard } from "./components/PasswordCard";
import { ProfileCard } from "./components/ProfileCard";
import { SessionsCard } from "./components/SessionsCard";
import { ThemeCard } from "./components/ThemeCard";

/** `/settings` — Tab 4 (docs/spec.md §4.9). */
export function SettingsPage() {
  const t = useT();
  const logout = useLogout();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("settings.title")} />
      <ProfileCard />
      <PasswordCard />
      <HouseholdCard />
      <LanguageCard />
      <ThemeCard />
      <SessionsCard />
      <AboutCard />
      <Button
        variant="secondary"
        leftIcon={<LogOut className="size-4" />}
        loading={logout.isPending}
        onClick={() => logout.mutate()}
      >
        {t("auth.logout")}
      </Button>
    </div>
  );
}

export default SettingsPage;
