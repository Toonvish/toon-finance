import { z } from "zod";
import { LOCALES } from "../i18n/locale.ts";
import { DisplayNameSchema, EmailSchema, HouseholdSummarySchema } from "./auth.ts";
import { IdSchema, IsoDateSchema, MailDeliverySchema, MemberSlotSchema } from "./common.ts";

export const HouseholdNameSchema = z.string().trim().min(1).max(80);

export const CreateHouseholdRequestSchema = z.object({
  name: HouseholdNameSchema,
  displayName: DisplayNameSchema.optional(),
});
export type CreateHouseholdRequest = z.infer<typeof CreateHouseholdRequestSchema>;

export const UpdateHouseholdRequestSchema = z.object({
  name: HouseholdNameSchema.optional(),
  defaultLocale: z.enum(LOCALES).optional(),
});
export type UpdateHouseholdRequest = z.infer<typeof UpdateHouseholdRequestSchema>;

export const UpdateMemberRequestSchema = z.object({ displayName: DisplayNameSchema });
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequestSchema>;

export const CreateInviteRequestSchema = z.object({ email: EmailSchema.optional() });
export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

export const AcceptInviteRequestSchema = z.object({
  token: z.string(),
  displayName: DisplayNameSchema.optional(),
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequestSchema>;

export const InviteStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

export const HouseholdResponseSchema = z.object({
  id: IdSchema,
  name: z.string(),
  defaultLocale: z.enum(LOCALES),
  memberCount: z.union([z.literal(1), z.literal(2)]),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type HouseholdResponse = z.infer<typeof HouseholdResponseSchema>;

export const MemberResponseSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
  memberSlot: MemberSlotSchema,
  name: z.string(),
  email: z.string(),
  joinedAt: IsoDateSchema,
});
export type MemberResponse = z.infer<typeof MemberResponseSchema>;

export const MemberListResponseSchema = z.object({ items: z.array(MemberResponseSchema) });
export type MemberListResponse = z.infer<typeof MemberListResponseSchema>;

export const HouseholdDetailResponseSchema = z.object({
  household: HouseholdResponseSchema,
  members: z.array(MemberResponseSchema),
  viewerSlot: MemberSlotSchema,
});
export type HouseholdDetailResponse = z.infer<typeof HouseholdDetailResponseSchema>;

export const InvitePreviewResponseSchema = z.object({
  householdName: z.string(),
  invitedByName: z.string(),
  expiresAt: IsoDateSchema,
});
export type InvitePreviewResponse = z.infer<typeof InvitePreviewResponseSchema>;

export const InviteResponseSchema = z.object({
  id: IdSchema,
  token: z.string(),
  inviteUrl: z.string(),
  email: z.string().nullable(),
  status: InviteStatusSchema,
  expiresAt: IsoDateSchema,
  createdAt: IsoDateSchema,
  mailDelivery: MailDeliverySchema,
});
export type InviteResponse = z.infer<typeof InviteResponseSchema>;

export const InviteListResponseSchema = z.object({ items: z.array(InviteResponseSchema) });
export type InviteListResponse = z.infer<typeof InviteListResponseSchema>;

export const AcceptInviteResponseSchema = z.object({
  household: HouseholdResponseSchema,
  memberSlot: MemberSlotSchema,
  alreadyMember: z.boolean(),
});
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;

/** `GET /api/households` reuses the same summary shape as `MeResponse.households` (schemas/auth.ts). */
export const HouseholdListResponseSchema = z.object({ items: z.array(HouseholdSummarySchema) });
export type HouseholdListResponse = z.infer<typeof HouseholdListResponseSchema>;
