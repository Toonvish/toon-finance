/**
 * Feature-level auth hooks that are NOT part of the session lifecycle
 * (`useLogin`/`useRegister`/`useLogout` live in `lib/session.tsx` instead,
 * because the session provider needs them too).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptInviteRequest,
  AcceptInviteResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from "@toon/shared";
import { acceptInvite, requestPasswordReset, resetPassword } from "@/lib/api";
import { invitePreviewQuery, queryKeys } from "@/lib/queries";

export function useInvitePreview(token: string) {
  return useQuery(invitePreviewQuery(token));
}

export function useRequestPasswordReset() {
  return useMutation<void, unknown, ForgotPasswordRequest>({
    mutationFn: (body) => requestPasswordReset(body),
  });
}

export function useResetPassword() {
  return useMutation<void, unknown, ResetPasswordRequest>({
    mutationFn: (body) => resetPassword(body),
  });
}

/** Joins the household behind an invite token. The caller is already signed in (or just registered via `useRegister({ inviteToken })`). */
export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation<AcceptInviteResponse, unknown, AcceptInviteRequest>({
    mutationFn: (body) => acceptInvite(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
