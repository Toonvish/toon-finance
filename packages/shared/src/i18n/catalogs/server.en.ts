/**
 * English — the SERVER catalog. See `server.de.ts` for what this mirrors and
 * why. Every key here must exist there with the same string-vs-plural shape
 * (enforced by `LocaleCatalog<ServerCatalog>` — a mismatch is a compile
 * error).
 */
import type { LocaleCatalog } from "../types.ts";
import type { ServerCatalog } from "./server.de.ts";

export const serverEn: LocaleCatalog<ServerCatalog> = {
  /* -------------------------- ApiError defaults -------------------------- */
  "server.error.badRequest": "Invalid request",
  "server.error.unauthorized": "Please sign in.",
  "server.error.invalidCredentials": "Email or password is incorrect.",
  "server.error.forbidden": "You don't have permission to do that.",
  "server.error.notFound": "Not found",
  "server.error.routeUnknown": "Unknown endpoint: {method} {path}",
  "server.error.conflict": "That conflicts with the current state.",
  "server.error.internal": "Unexpected error. Please try again later.",
  "server.error.requestFailed": "The request failed.",
  "server.error.tooManyAttempts": "Too many attempts. Please try again in {seconds} seconds.",

  /* --------------------------------- auth --------------------------------- */
  "server.auth.emailTaken": "An account with this email address already exists.",
  "server.auth.invalidJsonBody": "The request body is not valid JSON.",
  "server.auth.passwordRequired": "Please enter your current password.",
  "server.auth.resetTokenInvalid": "This link is invalid or has expired.",

  /* ----------------------------- household -------------------------------- */
  "server.household.noAccess": "This household does not belong to your account.",
  "server.household.required": "You don't belong to a household yet.",
  "server.household.full": "This household already has two members.",
  "server.household.memberHasLedger": "There are still transactions for this person. Remove them first.",

  /* -------------------------------- invite --------------------------------- */
  "server.invite.invalid": "This invite is invalid or has already been redeemed.",
  "server.invite.expired": "This invite has expired.",

  /* ----------------------------- transaction -------------------------------- */
  "server.transaction.amountZero": "The amount must not be 0.",
  "server.transaction.generated": "This transaction comes from the fixed-cost plan and cannot be changed.",
  "server.transaction.notFound": "This transaction does not exist.",

  /* -------------------------------- balance --------------------------------- */
  "server.balance.stale": "The balance has changed. It is now {amount}.",

  /* ------------------------------ settlement --------------------------------- */
  "server.settlement.amountInvalid": "The settlement amount must be greater than 0.",

  /* ------------------------------- category ---------------------------------- */
  "server.category.system": "This category belongs to the system and cannot be changed.",
  "server.category.inUse": "{count} transactions are still attached to this category.",
  "server.category.slugTaken": "This category already exists.",

  /* ------------------------- category names (write/read-time) ---------------- */
  "server.category.name.tiere": "Pets",
  "server.category.name.miete": "Rent",
  "server.category.name.nebenkosten": "Utilities",
  "server.category.name.fixkosten": "Fixed costs",
  "server.category.name.versicherung": "Insurance",
  "server.category.name.steuern_abgaben": "Taxes & fees",
  "server.category.name.baumarkt": "DIY & renovation",
  "server.category.name.moebel_wohnen": "Furniture & home",
  "server.category.name.elektronik": "Electronics",
  "server.category.name.lebensmittel": "Groceries",
  "server.category.name.haushalt_kueche": "Household & kitchen",
  "server.category.name.drogerie": "Drugstore & care",
  "server.category.name.kleidung": "Clothing & accessories",
  "server.category.name.spiele_medien": "Games & media",
  "server.category.name.hobby_kreativ": "Hobby & crafts",
  "server.category.name.mobilitaet": "Transport",
  "server.category.name.reisen": "Travel",
  "server.category.name.freizeit": "Leisure & going out",
  "server.category.name.geschenke": "Gifts & donations",
  "server.category.name.ausgleich": "Settlement & refunds",
  "server.category.name.sonstiges": "Other",

  /* ---------------------------------- tag ------------------------------------- */
  "server.tag.nameTaken": "This tag already exists.",

  /* --------------------------------- plan -------------------------------------- */
  "server.plan.disabled": "The fixed-cost plan is not active.",
  "server.plan.incomplete": "Fixed costs or an income are missing for this calculation.",
  "server.plan.periodLocked": "There is already a booking for this month.",
  "server.plan.periodOutOfRange": "This month is outside the plan's period range.",
  "server.plan.incomeOverlap": "This person already has an income starting this month.",

  /* ----------------------------- household (extra) ----------------------------- */
  "server.household.needsSecondMember": "This transaction kind needs a second household member.",

  /* ------------------------------- content (write-time) --------------------------- */
  "server.content.householdDefaultName": "Our household",
  "server.content.planBookingDescription": "Fixed-cost share {period}",
  "server.content.planAdjustmentDescription": "Correction fixed-cost share {period}",
  "server.content.settlementDescription": "Settlement",

  /* --------------------------------- mail --------------------------------------- */
  "server.mail.inviteSubject": 'Invitation to the household "{household}"',
  "server.mail.inviteBody":
    '{name} invites you to help run the household "{household}". Use this link to join: {url} — the link is valid for 14 days.',
  "server.mail.resetSubject": "Reset your password",
  "server.mail.resetBody":
    "Use this link to set a new password: {url} — the link is valid for one hour. If you did not request this, ignore this email.",

  /* ------------------------------- validation (Zod) ------------------------------ */
  "server.zod.fallback": "This input is invalid.",
  "server.zod.invalid_type": "Invalid value.",
  "server.zod.invalid_type.required": "This field is required.",
  "server.zod.too_small.string": "At least {minimum} characters.",
  "server.zod.too_small.number": "At least {minimum}.",
  "server.zod.too_big.string": "At most {maximum} characters.",
  "server.zod.too_big.number": "At most {maximum}.",
  "server.zod.invalid_format.email": "Please enter a valid email address.",
  "server.zod.invalid_format.uuid": "Invalid identifier.",
  "server.zod.invalid_enum": "Invalid selection.",
  "server.zod.field.password.too_small": "The password needs at least {minimum} characters.",
  "server.zod.field.email.invalid_format": "Please enter a valid email address.",
  "server.zod.field.amountCents.invalid_type": "Please enter an amount.",
  "server.zod.field.description.too_small": "Please describe the transaction briefly.",
  "server.zod.field.description.too_big": "The description is too long (at most {maximum} characters).",

  /* ------------------------------- validation (custom) ---------------------------- */
  "server.validation.periodFormat": "Please enter a month in the format YYYY-MM.",
  "server.validation.amountNotZero": "The amount must not be 0.",
  "server.validation.amountPositive": "The amount must be greater than 0.",
  "server.validation.periodRange": "The end must not be before the start.",
};
