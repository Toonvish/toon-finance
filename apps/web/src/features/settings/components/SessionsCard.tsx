import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { revokeSession } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { invalidate, sessionsQuery } from "@/lib/queries";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { LogOut } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Active sessions by HANDLE only, never by the raw session id (docs/spec.md
 * §3.4 — a session id is a 30-day bearer token and must never appear in an
 * access log or on screen).
 */
export function SessionsCard() {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const revoke = useMutation({
    mutationFn: (handle: string) => revokeSession(handle),
    onSuccess: () => void invalidate.sessions(queryClient),
    onError: (error) => toast.fromError(error),
  });

  return (
    <Card>
      <CardHeader title={t("settings.sessions.title")} />
      {sessions.isError ? <ErrorState inline error={sessions.error} /> : null}
      <ul className="flex flex-col gap-3">
        {(sessions.data?.items ?? []).map((session) => (
          <li key={session.handle} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                {session.current ? t("settings.sessions.current") : session.userAgent ?? session.handle}
                {session.current ? <Badge size="sm">{t("settings.household.you")}</Badge> : null}
              </p>
              <p className="truncate text-xs text-fg-muted">
                {t("settings.sessions.lastUsed", { date: formatDateTime(session.lastUsedAt) })}
              </p>
            </div>
            {!session.current ? (
              <IconButton
                label={t("settings.sessions.revoke")}
                icon={<LogOut />}
                loading={revoke.isPending}
                onClick={() => revoke.mutate(session.handle)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
