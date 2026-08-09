import { useState } from "react";
import type { InviteResponse } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useCreateInvite, useRevokeInvite } from "../lib/queries";

/**
 * The one place a second person joins the household (docs/spec.md §4.8) —
 * without this card a freshly installed household is not to be shared on a
 * phone at all. Renders one of three states: full, an open invite to share,
 * or the "create invite" form.
 */
export function InviteCard({
  householdId,
  memberCount,
  invites,
}: {
  householdId: string;
  memberCount: 1 | 2;
  invites: readonly InviteResponse[];
}) {
  const t = useT();
  const toast = useToast();
  const createInvite = useCreateInvite(householdId);
  const revokeInvite = useRevokeInvite(householdId);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const pending = invites.find((invite) => invite.status === "pending") ?? null;

  if (memberCount === 2) {
    return (
      <Card>
        <CardHeader title={t("settings.household.invite")} />
        <p className="text-sm text-fg-muted">{t("settings.household.full")}</p>
      </Card>
    );
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the link is still selectable text */
    }
  }

  if (pending) {
    const mailNote =
      pending.mailDelivery === "sent"
        ? t("settings.household.mailSent")
        : pending.mailDelivery === "failed"
          ? t("settings.household.mailFailed")
          : t("settings.household.mailNotConfigured");

    return (
      <Card>
        <CardHeader title={t("settings.household.invite")} />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t("settings.household.inviteLink")}</span>
            <div className="flex items-center gap-2">
              <Input readOnly value={pending.inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              <Button variant="secondary" onClick={() => copyLink(pending.inviteUrl)}>
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
            </div>
            <p className="text-sm text-fg-muted">{t("settings.household.inviteLinkHint")}</p>
          </div>
          <p className="text-sm text-fg-muted">{mailNote}</p>
          <Button
            variant="danger"
            loading={revokeInvite.isPending}
            onClick={() => {
              revokeInvite.mutate(pending.id, { onError: (error) => toast.fromError(error) });
            }}
          >
            {t("settings.household.inviteRevoke")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={t("settings.household.invite")} />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          createInvite.mutate(
            { email: email.trim().length > 0 ? email.trim() : undefined },
            { onError: (error) => toast.fromError(error) },
          );
        }}
      >
        {createInvite.isError ? <ErrorState inline error={createInvite.error} /> : null}
        <Input
          label={t("settings.household.inviteEmail")}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          optional
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
        <Button type="submit" loading={createInvite.isPending}>
          {t("settings.household.inviteCreate")}
        </Button>
      </form>
    </Card>
  );
}
