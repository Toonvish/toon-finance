import { useState } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { apiFieldErrors } from "@/lib/validation";
import { useCurrentUser, useRequiredHouseholdId } from "@/lib/session";
import { InviteCard } from "./components/InviteCard";
import { MemberList } from "./components/MemberList";
import {
  useHouseholdDetail,
  useHouseholdInvites,
  useLeaveHousehold,
  useUpdateHousehold,
  useUpdateMemberDisplayName,
} from "./lib/queries";

/**
 * `/household` — sidebar destination, reachable on mobile only via
 * `HouseholdCard` on `/settings` (docs/spec.md §4.8). `RequireHousehold`
 * (`lib/session.tsx`) already guarantees a household exists by the time this
 * renders — the "no household yet" state lives entirely in that guard.
 */
export function HouseholdPage() {
  const householdId = useRequiredHouseholdId();
  return <HouseholdDetail householdId={householdId} />;
}

function HouseholdDetail({ householdId }: { householdId: string }) {
  const t = useT();
  const toast = useToast();
  const currentUser = useCurrentUser();
  const detail = useHouseholdDetail(householdId);
  const invites = useHouseholdInvites(householdId);
  const updateHousehold = useUpdateHousehold(householdId);
  const updateDisplayName = useUpdateMemberDisplayName(householdId, currentUser.id);
  const leaveHousehold = useLeaveHousehold(householdId, currentUser.id);

  const [name, setName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  if (detail.isPending) return <LoadingBlock />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const household = detail.data.household;
  const members = detail.data.members;
  const ownMember = members.find((member) => member.userId === currentUser.id);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("settings.household.title")} />

      <Card>
        <CardHeader title={t("settings.household.name")} />
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = (name ?? household.name).trim();
            if (value.length === 0 || value === household.name) return;
            updateHousehold.mutate({ name: value }, { onError: (error) => toast.fromError(error) });
          }}
        >
          <Input
            containerClassName="flex-1"
            value={name ?? household.name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Button type="submit" loading={updateHousehold.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </Card>

      {ownMember ? (
        <Card>
          <CardHeader title={t("settings.household.displayName")} />
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = (displayName ?? ownMember.displayName).trim();
              if (value.length === 0 || value === ownMember.displayName) return;
              updateDisplayName.mutate({ displayName: value }, { onError: (error) => toast.fromError(error) });
            }}
          >
            <Input
              containerClassName="flex-1"
              value={displayName ?? ownMember.displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
            <Button type="submit" loading={updateDisplayName.isPending}>
              {t("common.save")}
            </Button>
          </form>
        </Card>
      ) : null}

      <MemberList members={members} />

      <InviteCard householdId={householdId} memberCount={household.memberCount} invites={invites.data?.items ?? []} />

      <Card>
        <CardHeader title={t("settings.household.leave")} />
        {leaveError ? <ErrorState inline description={leaveError} className="mb-3" /> : null}
        <Button variant="danger" onClick={() => setLeaveOpen(true)}>
          {t("settings.household.leave")}
        </Button>
      </Card>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t("settings.household.leave")}
        description={t("settings.household.leaveConfirm")}
        destructive
        onConfirm={async () => {
          setLeaveError(null);
          try {
            await leaveHousehold.mutateAsync();
          } catch (error) {
            setLeaveError(apiFieldErrors(error)._form ?? t("common.errorGeneric"));
            throw error;
          }
        }}
      />
    </div>
  );
}

export default HouseholdPage;
