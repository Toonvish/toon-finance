import { z } from "zod";
import { refineKey } from "../i18n/zod.ts";

/** All ids are `crypto.randomUUID()` strings. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** All timestamps travel over the wire as ISO-8601 strings (stored as unix ms in SQLite). */
export const IsoDateSchema = z.iso.datetime({ offset: true });
export type IsoDate = z.infer<typeof IsoDateSchema>;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function isPeriodString(value: string): boolean {
  return PERIOD_RE.test(value);
}

/** A calendar month, `'YYYY-MM'` (docs/ledger-spec.md §0). */
export const PeriodSchema = z.string().refine(isPeriodString, refineKey("server.validation.periodFormat"));
export type PeriodValue = z.infer<typeof PeriodSchema>;

/** Signed integer cents — the only money representation on the wire. Never a float, never a decimal string. */
export const CentsSchema = z.number().int();

/** `CentsSchema`, additionally forbidding `0` (docs/spec.md §3.6: the only forbidden transaction amount). */
export const NonZeroCentsSchema = CentsSchema.refine(
  (value) => value !== 0,
  refineKey("server.validation.amountNotZero"),
);

/** `CentsSchema`, additionally requiring a positive value (fixed-cost items, incomes, settlement amounts). */
export const PositiveCentsSchema = CentsSchema.refine(
  (value) => value > 0,
  refineKey("server.validation.amountPositive"),
);

/** Machine-readable error codes. `ApiError.code` is a stable wire contract — never renamed, never localised. */
export const ERROR_CODES = [
  // generic (same shape as toon-recipe)
  "bad_request",
  "validation_failed",
  "unauthorized",
  "invalid_credentials",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
  // auth
  "email_taken",
  "reset_token_invalid",
  "password_required",
  // household + invite
  "invite_invalid",
  "invite_expired",
  "household_full",
  "household_required",
  "member_has_ledger",
  // ledger
  "transaction_amount_zero",
  "transaction_generated",
  "balance_stale",
  "settlement_amount_invalid",
  // categories + tags
  "category_in_use",
  "category_system",
  "category_slug_taken",
  "tag_name_taken",
  // fixed-cost plan
  "plan_disabled",
  "plan_incomplete",
  "plan_period_locked",
  "plan_period_out_of_range",
  // client-minted only, never sent by the server
  "network_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** One entry of a `validation_failed` error's `details` array. */
export const ValidationIssueSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
  i18n: z
    .object({
      key: z.string(),
      values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    })
    .optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** The one and only error envelope every endpoint uses: `{ error: { code, message, details? } }`. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Shared list envelope: `{ items, total, limit, offset }`. */
export function listResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

/**
 * Query params for a paginated list endpoint. `limit` defaults to 50, max
 * 200 — higher than toon-recipe's 24/100 (docs/spec.md §8.2 #12): a
 * transaction list is a dense row listing, not a card grid, and a month has
 * roughly 60 rows.
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

const BOOLEAN_QUERY_VALUES: Record<string, boolean> = {
  true: true,
  "1": true,
  false: false,
  "0": false,
};

/**
 * A boolean query-string flag (`?includeAggregates=false`). Deliberately NOT
 * `z.coerce.boolean()`: that coerces via `Boolean(value)`, so the STRING
 * `"false"` — truthy as a string — would parse to `true`. This accepts an
 * actual boolean (already-parsed JSON bodies) or the literal strings
 * `"true"/"false"/"1"/"0"` and rejects anything else.
 */
export const BooleanQuerySchema = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === "boolean") return value;
  const normalized = BOOLEAN_QUERY_VALUES[value.toLowerCase()];
  if (normalized === undefined) {
    ctx.addIssue({ code: "custom", message: "invalid boolean" });
    return z.NEVER;
  }
  return normalized;
});

/**
 * What became of a mail the request tried to send. THREE states, not a
 * boolean, because the two non-deliveries need different copy and only the
 * server can tell them apart — the UI must never render the last two as
 * success (docs/spec.md §3.5).
 */
export const MailDeliverySchema = z.enum(["sent", "not_configured", "failed"]);
export type MailDelivery = z.infer<typeof MailDeliverySchema>;

/** `household_members.member_slot` — exactly two seats, enforced by the DB (docs/spec.md §2.4). */
export const MemberSlotSchema = z.union([z.literal(1), z.literal(2)]);
export type MemberSlot = z.infer<typeof MemberSlotSchema>;
