import { useState } from "react";
import type { MemberResponse } from "@toon/shared";
import { Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useCurrentUser } from "@/lib/session";
import { apiFieldErrors } from "@/lib/validation";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useRemovePlaceholderMember, useRenamePlaceholderMember } from "../lib/queries";

/**
 * The household's (at most two) members, docs/spec.md §4.8. A PLACEHOLDER
 * (a seat without an account behind it) carries a badge and the two actions
 * nobody else could perform for them: rename and remove. A real second
 * member gets neither — at two people, editing the other's seat is not a
 * feature (docs/spec.md §3.5).
 */
export function MemberList({ householdId, members }: { householdId: string; members: readonly MemberResponse[] }) {
  const t = useT();
  const toast = useToast();
  const currentUser = useCurrentUser();
  const rename = useRenamePlaceholderMember(householdId);
  const remove = useRemovePlaceholderMember(householdId);

  const [renaming, setRenaming] = useState<{ userId: string; value: string } | null>(null);
  const [removing, setRemoving] = useState<MemberResponse | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader title={t("settings.household.members")} />
      <ul className="flex flex-col gap-3">
        {members.map((member) => {
          const isYou = member.userId === currentUser.id;
          const isPlaceholder = !member.hasAccount;
          const isRenaming = renaming?.userId === member.userId;
          return (
            <li key={member.userId} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-fg"
              >
                {member.memberSlot}
              </span>
              <div className="min-w-0 flex-1">
                {isRenaming ? (
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = renaming.value.trim();
                      if (value.length === 0) return;
                      rename.mutate(
                        { userId: member.userId, displayName: value },
                        { onSuccess: () => setRenaming(null), onError: (error) => toast.fromError(error) },
                      );
                    }}
                  >
                    <Input
                      containerClassName="flex-1"
                      aria-label={t("settings.household.displayName")}
                      data-autofocus
                      value={renaming.value}
                      onChange={(event) => setRenaming({ userId: member.userId, value: event.currentTarget.value })}
                    />
                    <Button type="submit" size="sm" loading={rename.isPending}>
                      {t("common.save")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      {t("common.cancel")}
                    </Button>
                  </form>
                ) : (
                  <>
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                      {member.displayName}
                      {isYou ? <Badge size="sm">{t("settings.household.you")}</Badge> : null}
                      {isPlaceholder ? (
                        <Badge size="sm" variant="warning">
                          {t("settings.household.placeholderBadge")}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {isPlaceholder
                        ? t("settings.household.placeholderHint")
                        : t("settings.household.joinedAt", { date: formatDate(member.joinedAt) })}
                    </p>
                  </>
                )}
              </div>
              {isPlaceholder && !isRenaming ? (
                <ActionMenu
                  items={[
                    {
                      label: t("settings.household.placeholderRename"),
                      icon: <Pencil />,
                      onSelect: () => setRenaming({ userId: member.userId, value: member.displayName }),
                    },
                    {
                      label: t("settings.household.placeholderRemove"),
                      icon: <Trash2 />,
                      variant: "danger",
                      onSelect: () => {
                        setRemoveError(null);
                        setRemoving(member);
                      },
                    },
                  ]}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t("settings.household.placeholderRemove")}
        description={
          removing ? t("settings.household.placeholderRemoveConfirm", { name: removing.displayName }) : null
        }
        destructive
        onConfirm={async () => {
          if (!removing) return;
          try {
            await remove.mutateAsync(removing.userId);
          } catch (error) {
            setRemoveError(apiFieldErrors(error)._form ?? t("common.errorGeneric"));
            throw error;
          }
        }}
      >
        {removeError ? <ErrorState inline description={removeError} /> : null}
      </ConfirmDialog>
    </Card>
  );
}
