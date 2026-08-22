/**
 * "There is no second person yet" — the one state in which the capture form
 * cannot be shown at all: a household of one has nothing to split, so every
 * Art on `KindPicker` would be meaningless and the only useful action left is
 * the invitation.
 *
 * BOTH frames of the capture flow render it (the global quick-add sheet and
 * the `/new` page), which is why it is a component rather than the same
 * `EmptyState` written out twice: the copy and the destination are identical
 * in both, and only the sheet has anything extra to do on the way out.
 */
import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useT } from "@/lib/i18n/I18nProvider.tsx";

export interface InviteSecondPersonProps {
  /** Called when the link is followed — the sheet uses it to close itself first. */
  onNavigate?: () => void;
  className?: string;
}

export function InviteSecondPerson({ onNavigate, className }: InviteSecondPersonProps) {
  const t = useT();
  return (
    <EmptyState
      className={className}
      icon={<UserPlus />}
      title={t("nav.household")}
      description={t("settings.household.invite")}
      action={
        <Link to="/household" onClick={onNavigate} className="w-full">
          <Button fullWidth>{t("settings.household.manage")}</Button>
        </Link>
      }
    />
  );
}
