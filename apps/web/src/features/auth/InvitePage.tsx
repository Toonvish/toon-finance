import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Users, Wallet } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { isApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useAcceptInvite, useInvitePreview } from "./lib/queries";

function AuthCard({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-gutter py-8">
      <Card padding="lg" className="w-full max-w-sm">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg"
        >
          <Wallet className="size-6" />
        </span>
        <h1 className="mt-4 text-center text-xl font-semibold text-fg">{title}</h1>
        <div className="mt-1 text-center text-sm text-fg-muted">{subtitle}</div>
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
}

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
      <AuthCard title={t("auth.invite.title")} subtitle={message}>
        <Link to="/login" className="block">
          <Button fullWidth variant="secondary">
            {t("auth.login.title")}
          </Button>
        </Link>
      </AuthCard>
    );
  }

  const invite = preview.data;

  return (
    <AuthCard
      title={t("auth.invite.title")}
      subtitle={t("auth.invite.subtitle", { name: invite.invitedByName, household: invite.householdName })}
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
    </AuthCard>
  );
}

export default InvitePage;
