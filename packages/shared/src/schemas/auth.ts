import { z } from "zod";
import { LOCALES } from "../i18n/locale.ts";
import { refineKey } from "../i18n/zod.ts";
import { IdSchema, IsoDateSchema, MemberSlotSchema } from "./common.ts";

/** Auth is email + password only (docs/spec.md §1.2 #4) — no OAuth, no provider enum. */
export const PasswordSchema = z.string().min(10).max(200);
/**
 * A password as SUBMITTED for verification (login, current password, reset).
 * No minimum — a legacy or wrong password must still reach argon2 and fail
 * there, indistinguishably — but the same ceiling as `PasswordSchema`: the
 * request body limit is 20 MB, and argon2id over a multi-megabyte string on
 * an unauthenticated endpoint is a CPU-pinning primitive, not a login.
 */
export const SubmittedPasswordSchema = z.string().max(200);
/** Opaque 43-char base64url tokens (invite, reset) — anything longer is not ours. */
export const OpaqueTokenSchema = z.string().min(1).max(200);

/** Trims + lowercases BEFORE validating, so `" Foo@Bar.DE "` is accepted. */
export const EmailSchema = z.string().max(254).trim().toLowerCase().pipe(z.email());

/**
 * Display and household names: 1–80 chars, no control characters. A `\n` in
 * a household name would otherwise travel into the invite mail's Subject and
 * be refused by the SMTP header guard — a user-triggerable delivery failure.
 */
const NO_CONTROL_CHARS = /^[^\p{Cc}]*$/u;
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => NO_CONTROL_CHARS.test(value), refineKey("server.validation.noControlChars"));
export const LocaleSchema = z.enum(LOCALES);

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  name: DisplayNameSchema,
  password: PasswordSchema,
  /** Present when joining an existing household via an invite link. */
  inviteToken: OpaqueTokenSchema.optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: SubmittedPasswordSchema,
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UpdateProfileRequestSchema = z.object({
  name: DisplayNameSchema.optional(),
  locale: LocaleSchema.optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: SubmittedPasswordSchema,
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({ email: EmailSchema });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: OpaqueTokenSchema,
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
