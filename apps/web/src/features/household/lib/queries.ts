import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateHouseholdRequest,
  CreateInviteRequest,
  UpdateHouseholdRequest,
  UpdateMemberRequest,
} from "@toon/shared";
import {
  createHousehold,
  createHouseholdInvite,
  leaveHousehold,
  revokeHouseholdInvite,
  updateHousehold,
  updateMemberDisplayName,
} from "@/lib/api";
import {
  householdDetailQuery,
  householdInvitesQuery,
  householdMembersQuery,
  invalidate,
} from "@/lib/queries";

export function useHouseholdDetail(householdId: string | null) {
  return useQuery({ ...householdDetailQuery(householdId ?? ""), enabled: householdId !== null });
}

export function useHouseholdMembers(householdId: string | null) {
  return useQuery({ ...householdMembersQuery(householdId ?? ""), enabled: householdId !== null });
}

export function useHouseholdInvites(householdId: string | null) {
  return useQuery({ ...householdInvitesQuery(householdId ?? ""), enabled: householdId !== null });
}

/** The rare "start a new household" path (docs/spec.md §3.5) — there is no switcher in the UI. */
export function useCreateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHouseholdRequest) => createHousehold(body),
    onSuccess: () => {
      void invalidate.me(queryClient);
      void invalidate.households(queryClient);
    },
  });
}

export function useUpdateHousehold(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateHouseholdRequest) => updateHousehold(householdId, body),
    onSuccess: () => {
      void invalidate.householdDetail(queryClient, householdId);
      void invalidate.me(queryClient);
    },
  });
}

/** Renames the caller's own display name — the API 403s on any other userId. */
export function useUpdateMemberDisplayName(householdId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMemberRequest) => updateMemberDisplayName(householdId, userId, body),
    onSuccess: () => {
      void invalidate.members(queryClient, householdId);
      void invalidate.householdDetail(queryClient, householdId);
    },
  });
}

/** Leaves the household — only ever the caller's own membership. 409 `member_has_ledger` while any transaction still names them as payer. */
export function useLeaveHousehold(householdId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => leaveHousehold(householdId, userId),
    onSuccess: () => {
      void invalidate.me(queryClient);
      void invalidate.household(queryClient, householdId);
    },
  });
}

export function useCreateInvite(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteRequest) => createHouseholdInvite(householdId, body),
    onSuccess: () => {
      void invalidate.invites(queryClient, householdId);
    },
  });
}

export function useRevokeInvite(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeHouseholdInvite(householdId, inviteId),
    onSuccess: () => {
      void invalidate.invites(queryClient, householdId);
    },
  });
}
