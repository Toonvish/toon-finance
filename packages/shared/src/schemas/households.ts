import { z } from "zod";
import { LOCALES } from "../i18n/locale.ts";
import { DisplayNameSchema, EmailSchema, HouseholdSummarySchema } from "./auth.ts";
import { IdSchema, IsoDateSchema, MailDeliverySchema, MemberSlotSchema } from "./common.ts";

/** Same rules as a display name — see `DisplayNameSchema` for the control-character ban. */
export const HouseholdNameSchema = DisplayNameSchema;

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

/** `POST /members` — seats a PLACEHOLDER (a person without an account) in the free slot. */
export const CreatePlaceholderMemberRequestSchema = z.object({ displayName: DisplayNameSchema });
export type CreatePlaceholderMemberRequest = z.infer<typeof CreatePlaceholderMemberRequestSchema>;

export const CreateInviteRequestSchema = z.object({
  email: EmailSchema.optional(),
  /**
   * Present for a CLAIM invite: the placeholder member this link lets someone
   * turn into their own account. Allowed at two members (the seat is the
   * placeholder's), refused with `member_has_account` for a member who already
   * has one.
   */
  claimsUserId: IdSchema.optional(),
});
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
  /** `null` for a placeholder — there is no account behind this seat (yet). */
  email: z.string().nullable(),
  hasAccount: z.boolean(),
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
  /** Display name of the placeholder this CLAIM invite hands over; `null` for a plain invite. */
  claimsDisplayName: z.string().nullable(),
});
export type InvitePreviewResponse = z.infer<typeof InvitePreviewResponseSchema>;

export const InviteResponseSchema = z.object({
  id: IdSchema,
  token: z.string(),
  inviteUrl: z.string(),
  email: z.string().nullable(),
  claimsUserId: IdSchema.nullable(),
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
