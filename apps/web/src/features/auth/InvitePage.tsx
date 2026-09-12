import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { isApiError } from "@/lib/api";
import { useLogout, useSession } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { AuthLayout } from "./AuthLayout";
import { useAcceptInvite, useInvitePreview } from "./lib/queries";

/**
 * `/invite/$token` — public preview of an invite, plus the join action for a
 * signed-in viewer or the two hand-off links (register/log in) for a fresh
 * visitor (docs/spec.md §4.2, §3.5).
 */
export function InvitePage() {
  const t = useT();
  const { token } = useParams({ strict: false }) as { token?: string };
  const { isAuthenticated, isLoading } = useSession();
  const preview = useInvitePreview(token ?? "");
  const accept = useAcceptInvite();
  const logout = useLogout();
  const navigate = useNavigate();
  const toast = useToast();

  if (!token) return null;

  if (preview.isPending || isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <LoadingBlock />
      </div>
    );
  }

  if (preview.isError) {
    const code = isApiError(preview.error) ? preview.error.code : undefined;
    const message =
      code === "invite_expired" ? t("auth.invite.expired") : t("auth.invite.invalid");
    return (
      <AuthLayout title={t("auth.invite.title")} description={message}>
        <Link to="/login" className="block">
          <Button fullWidth variant="secondary">
            {t("auth.login.title")}
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  const invite = preview.data;

  // A CLAIM invite hands over a seat that already exists (a placeholder
  // without an account). It is redeemed by REGISTERING — a signed-in account
  // cannot take it (the server answers `invite_claim_requires_register`), so
  // the only offer here is "sign out, then create the account".
  if (invite.claimsDisplayName !== null) {
    return (
      <AuthLayout
        title={t("auth.invite.title")}
        description={t("auth.invite.claimSubtitle", {
          name: invite.invitedByName,
          household: invite.householdName,
          display: invite.claimsDisplayName,
        })}
      >
        {isAuthenticated ? (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm text-fg-muted">{t("auth.invite.claimLoggedIn")}</p>
            <Button fullWidth variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
              {t("auth.invite.claimLogout")}
            </Button>
          </div>
        ) : (
          <Link to="/register" search={{ invite: token }} className="block">
            <Button fullWidth size="lg">
              {t("auth.invite.claimCreateAccount")}
            </Button>
          </Link>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.invite.title")}
      description={t("auth.invite.subtitle", { name: invite.invitedByName, household: invite.householdName })}
    >
      {isAuthenticated ? (
        <Button
          fullWidth
          size="lg"
          leftIcon={<Users className="size-4" />}
          loading={accept.isPending}
          onClick={() => {
            accept.mutate(
              { token },
              {
                onSuccess: () => {
                  void navigate({ to: "/", replace: true });
                },
                onError: (error) => {
                  const code = isApiError(error) ? error.code : undefined;
                  if (code === "household_full") {
                    toast.error(t("auth.invite.full"));
                    return;
                  }
                  toast.fromError(error);
                },
              },
            );
          }}
        >
          {t("auth.invite.acceptLoggedIn")}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Link to="/register" search={{ invite: token }} className="block">
            <Button fullWidth size="lg">
              {t("auth.invite.acceptNewAccount")}
            </Button>
          </Link>
          <Link to="/login" search={{ next: `/invite/${token}` }} className="block">
            <Button fullWidth variant="secondary">
              {t("auth.invite.haveAccount")}
            </Button>
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}

export default InvitePage;
