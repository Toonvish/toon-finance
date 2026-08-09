import { z } from "zod";
import { LOCALES } from "../i18n/locale.ts";
import { IdSchema, IsoDateSchema, MemberSlotSchema } from "./common.ts";

/** Auth is email + password only (docs/spec.md §1.2 #4) — no OAuth, no provider enum. */
export const PasswordSchema = z.string().min(10).max(200);

/** Trims + lowercases BEFORE validating, so `" Foo@Bar.DE "` is accepted. */
export const EmailSchema = z.string().max(254).trim().toLowerCase().pipe(z.email());

export const DisplayNameSchema = z.string().trim().min(1).max(80);
export const LocaleSchema = z.enum(LOCALES);

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  name: DisplayNameSchema,
  password: PasswordSchema,
  /** Present when joining an existing household via an invite link. */
  inviteToken: z.string().optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UpdateProfileRequestSchema = z.object({
  name: DisplayNameSchema.optional(),
  locale: LocaleSchema.optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({ email: EmailSchema });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string(),
  password: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

/** The full user record as the API exposes it to the user themself. */
export const UserResponseSchema = z.object({
  id: IdSchema,
  email: z.string(),
  name: z.string(),
  locale: LocaleSchema,
  createdAt: IsoDateSchema,
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

/** A household as seen from `GET /api/auth/me` — enough to render a picker, never a switcher (there is none). */
export const HouseholdSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  memberSlot: MemberSlotSchema,
  memberCount: z.union([z.literal(1), z.literal(2)]),
});
export type HouseholdSummary = z.infer<typeof HouseholdSummarySchema>;

export const MeResponseSchema = z.object({
  user: UserResponseSchema,
  households: z.array(HouseholdSummarySchema),
  activeHouseholdId: IdSchema.nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const AuthSessionResponseSchema = z.object({
  user: UserResponseSchema,
  household: HouseholdSummarySchema.nullable(),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

/** A session-list row carries a stable public HANDLE, never the cookie value itself. */
export const SessionInfoSchema = z.object({
  handle: z.string(),
  current: z.boolean(),
  createdAt: IsoDateSchema,
  lastUsedAt: IsoDateSchema,
  expiresAt: IsoDateSchema,
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const SessionListResponseSchema = z.object({ items: z.array(SessionInfoSchema) });
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;
