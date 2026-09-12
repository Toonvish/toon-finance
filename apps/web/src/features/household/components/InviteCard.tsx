import { useState } from "react";
import type { InviteResponse, MemberResponse } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useAddPlaceholderMember, useCreateInvite, useRevokeInvite } from "../lib/queries";

/**
 * The one place a second person joins the household (docs/spec.md §4.8) —
 * without this card a freshly installed household is not to be shared on a
 * phone at all. Renders one of four states:
 *
 *  - full (two real accounts): nothing to do here.
 *  - an open invite to share — plain or claim, same link UI.
 *  - one member: the invite form PLUS "add without an account" (a placeholder).
 *  - two members, the other a placeholder: the "link an e-mail" form, which
 *    mints a CLAIM invite for that seat.
 */
export function InviteCard({
  householdId,
  members,
  invites,
}: {
  householdId: string;
  members: readonly MemberResponse[];
  invites: readonly InviteResponse[];
}) {
  const t = useT();
  const toast = useToast();
  const currentUser = useCurrentUser();
  const createInvite = useCreateInvite(householdId);
  const revokeInvite = useRevokeInvite(householdId);
  const addPlaceholder = useAddPlaceholderMember(householdId);
  const [email, setEmail] = useState("");
  const [placeholderName, setPlaceholderName] = useState("");
  const [copied, setCopied] = useState(false);

  const other = members.find((member) => member.userId !== currentUser.id) ?? null;
  const placeholder = other && !other.hasAccount ? other : null;
  const pending = invites.find((invite) => invite.status === "pending") ?? null;

  if (other && !placeholder) {
    return (
      <Card>
        <CardHeader title={t("settings.household.invite")} />
        <p className="text-sm text-fg-muted">{t("settings.household.full")}</p>
      </Card>
    );
  }

  const title = placeholder
    ? t("settings.household.linkAccount", { name: placeholder.displayName })
    : t("settings.household.invite");

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
        <CardHeader title={title} />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t("settings.household.inviteLink")}</span>
            <div className="flex items-center gap-2">
              <Input readOnly value={pending.inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              <Button variant="secondary" onClick={() => copyLink(pending.inviteUrl)}>
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
            </div>
            <p className="text-sm text-fg-muted">
              {pending.claimsUserId ? t("settings.household.linkAccountLinkHint") : t("settings.household.inviteLinkHint")}
            </p>
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
      <CardHeader title={title} />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          createInvite.mutate(
            {
              email: email.trim().length > 0 ? email.trim() : undefined,
              ...(placeholder ? { claimsUserId: placeholder.userId } : {}),
            },
            { onError: (error) => toast.fromError(error) },
          );
        }}
      >
        {placeholder ? <p className="text-sm text-fg-muted">{t("settings.household.linkAccountHint")}</p> : null}
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
          {placeholder ? t("settings.household.linkAccountCreate") : t("settings.household.inviteCreate")}
        </Button>
      </form>

      {!placeholder ? (
        <form
          className="mt-5 flex flex-col gap-3 border-t border-border pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            const displayName = placeholderName.trim();
            if (displayName.length === 0) return;
            addPlaceholder.mutate(
              { displayName },
              { onSuccess: () => setPlaceholderName(""), onError: (error) => toast.fromError(error) },
            );
          }}
        >
          <div>
            <h3 className="text-sm font-semibold text-fg">{t("settings.household.placeholderTitle")}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t("settings.household.placeholderDescription")}</p>
          </div>
          {addPlaceholder.isError ? <ErrorState inline error={addPlaceholder.error} /> : null}
          <Input
            label={t("settings.household.displayName")}
            autoComplete="off"
            required
            value={placeholderName}
            onChange={(event) => setPlaceholderName(event.currentTarget.value)}
          />
          <Button type="submit" variant="secondary" loading={addPlaceholder.isPending}>
            {t("settings.household.placeholderCreate")}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
