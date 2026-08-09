import type { MemberResponse } from "@toon/shared";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useCurrentUser } from "@/lib/session";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";

/** The household's (at most two) members, docs/spec.md §4.8. */
export function MemberList({ members }: { members: readonly MemberResponse[] }) {
  const t = useT();
  const currentUser = useCurrentUser();

  return (
    <Card>
      <CardHeader title={t("settings.household.members")} />
      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-fg"
            >
              {member.memberSlot}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                {member.displayName}
                {member.userId === currentUser.id ? (
                  <Badge size="sm">{t("settings.household.you")}</Badge>
                ) : null}
              </p>
              <p className="truncate text-xs text-fg-muted">
                {t("settings.household.joinedAt", { date: formatDate(member.joinedAt) })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
