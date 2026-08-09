/**
 * The COMPLETE database schema — every table any phase of this app needs, in
 * one migration. Built by the [API-KERN] agent even though several tables
 * ([API-DOMÄNE] territory: transactions, categories, tags, the fixed-cost
 * plan) are only READ/WRITTEN by routers this agent does not build. One
 * schema, one migration avoids two agents fighting over `drizzle-kit
 * generate` producing conflicting migration files.
 *
 * Conventions (docs/spec.md §2, verbatim):
 * - ids: crypto.randomUUID() text primary keys
 * - timestamps: integer unix MILLISECONDS (exposed as ISO strings by the API)
 * - money: integer CENTS, signed. never real(), never float. `real` here
 *   would be a bug.
 * - periods: text 'YYYY-MM', CHECK-constrained by GLOB
 * - booleans: integer 0/1 via mode: "boolean"
 * - every FK used for listing has an index; household-scoped tables cascade
 *   from `households`
 * - a user row is never cascade-deleted through the ledger: payer_id is
 *   RESTRICT
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = (): number => Date.now();
const PERIOD_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]";

/* -------------------------------------------------------------------------- */
/* users — one account, independent of any household                        */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // lower(trim(email)) — the app writes this, never a DB trigger, so a
    // parallel registration racing the same address collides on the unique
    // index below instead of two read-modify-writes interleaving.
    emailNormalized: text("email_normalized").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    locale: text("locale", { enum: ["de", "en"] }).notNull().default("de"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("users_email_normalized_uidx").on(t.emailNormalized)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/* -------------------------------------------------------------------------- */
/* sessions — opaque session ids, the cookie value IS the primary key       */
/* -------------------------------------------------------------------------- */

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    lastUsedAt: integer("last_used_at").notNull().$defaultFn(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

/* -------------------------------------------------------------------------- */
/* households — the container everything hangs off                          */
/* -------------------------------------------------------------------------- */

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  defaultLocale: text("default_locale", { enum: ["de", "en"] }).notNull().default("de"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
});

export type HouseholdRow = typeof households.$inferSelect;
export type NewHouseholdRow = typeof households.$inferInsert;

/* -------------------------------------------------------------------------- */
/* household_members — the two seats, as a DB fact                          */
/* -------------------------------------------------------------------------- */

export const householdMembers = sqliteTable(
  "household_members",
  {
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    // 1 or 2 — slot 1 anchors the balance sign convention (docs/spec.md §2.4).
    memberSlot: integer("member_slot").notNull(),
    // "Eric", "Sandy" — the name visible inside this household.
    displayName: text("display_name").notNull(),
    joinedAt: integer("joined_at").notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    uniqueIndex("household_members_slot_uidx").on(t.householdId, t.memberSlot),
    index("household_members_user_idx").on(t.userId),
    check("household_members_slot_range", sql`${t.memberSlot} in (1, 2)`),
  ],
);

export type HouseholdMemberRow = typeof householdMembers.$inferSelect;
export type NewHouseholdMemberRow = typeof householdMembers.$inferInsert;

/* -------------------------------------------------------------------------- */
/* invites — the token IS the capability                                    */
/* -------------------------------------------------------------------------- */

export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    // Raw value, 32 bytes base64url — unlike password_reset_tokens this is
    // NOT hashed: a leaked invites table costs a household membership, a
    // leaked reset table would cost every account (docs/spec.md §2.5).
    token: text("token").notNull(),
    // Informative, NEVER enforced — otherwise a forwarded link would break.
    email: text("email"),
    invitedBy: text("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    acceptedAt: integer("accepted_at"),
    acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("invites_token_uidx").on(t.token),
    index("invites_household_status_idx").on(t.householdId, t.status),
  ],
);

export type InviteRow = typeof invites.$inferSelect;
export type NewInviteRow = typeof invites.$inferInsert;

/* -------------------------------------------------------------------------- */
/* categories — stable slugs, label from the catalog                        */
/* -------------------------------------------------------------------------- */

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    // "tiere", "fixkosten", … or "custom-<uuid8>" — the code-facing key.
    slug: text("slug").notNull(),
    // null = label is rendered from the i18n catalog on every read; set once
    // the household renames the row, and never re-translated after that.
    customLabel: text("custom_label"),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("categories_household_slug_uidx").on(t.householdId, t.slug),
    index("categories_household_position_idx").on(t.householdId, t.position),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;

/* -------------------------------------------------------------------------- */
/* tags + transaction_tags — normalized, with an autocomplete axis           */
/* -------------------------------------------------------------------------- */

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // normalizeTagName(name) — lower(trim(collapse whitespace)).
    nameKey: text("name_key").notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("tags_household_name_key_uidx").on(t.householdId, t.nameKey),
    index("tags_household_usage_idx").on(t.householdId, t.usageCount),
  ],
);

export type TagRow = typeof tags.$inferSelect;
export type NewTagRow = typeof tags.$inferInsert;

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.tagId] }),
    index("transaction_tags_tag_idx").on(t.tagId),
  ],
);

export type TransactionTagRow = typeof transactionTags.$inferSelect;
export type NewTransactionTagRow = typeof transactionTags.$inferInsert;

/* -------------------------------------------------------------------------- */
/* transactions — the cash book                                              */
/* -------------------------------------------------------------------------- */

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    payerId: text("payer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    splitMode: text("split_mode", { enum: ["SPLIT_EQUAL", "OTHER_ONLY", "SETTLEMENT"] }).notNull(),
    // signed, NEVER 0 (the check below) — negative amounts are meaningful
    // (refunds, corrections) and must keep their sign.
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    // unix ms, 00:00 Europe/Berlin for day-precision entries.
    bookedAt: integer("booked_at").notNull(),
    dateSource: text("date_source", { enum: ["exact", "day", "month", "estimated"] }).notNull(),
    origin: text("origin", {
      enum: ["manual", "fixed_plan", "fixed_plan_adjustment", "import"],
    }).notNull(),
    // 'YYYY-MM' for origin fixed_plan*, null otherwise.
    planPeriod: text("plan_period"),
    categorySource: text("category_source", { enum: ["manual", "heuristic", "system"] }).notNull(),
    // Sheet row of the one-time xlsx import — preserves import order.
    importSeq: integer("import_seq"),
    // Idempotency key; null for manual rows (SQLite treats every NULL as
    // distinct, so manual rows never collide on the unique index below).
    externalKey: text("external_key"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("transactions_household_external_key_uidx").on(t.householdId, t.externalKey),
    index("transactions_household_booked_idx").on(t.householdId, t.bookedAt, t.importSeq),
    index("transactions_household_category_idx").on(t.householdId, t.categoryId),
    index("transactions_household_plan_idx").on(t.householdId, t.origin, t.planPeriod),
    check("transactions_amount_not_zero", sql`${t.amountCents} <> 0`),
    check(
      "transactions_plan_period_format",
      sql`${t.planPeriod} is null or ${t.planPeriod} glob '${sql.raw(PERIOD_GLOB)}'`,
    ),
  ],
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;

/* -------------------------------------------------------------------------- */
/* mutation_claims — replay protection for the offline queue                */
/* -------------------------------------------------------------------------- */

export const mutationClaims = sqliteTable(
  "mutation_claims",
  {
    // the client-minted mutationId — claimMutation() is an INSERT on THIS
    // primary key with onConflictDoNothing(), never a select-then-write.
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    appliedAt: integer("applied_at").notNull().$defaultFn(now),
  },
  (t) => [index("mutation_claims_applied_at_idx").on(t.appliedAt)],
);

export type MutationClaimRow = typeof mutationClaims.$inferSelect;
export type NewMutationClaimRow = typeof mutationClaims.$inferInsert;

/* -------------------------------------------------------------------------- */
/* fixed_cost_items — temporal fixed-cost line items                        */
/* -------------------------------------------------------------------------- */

export const fixedCostItems = sqliteTable(
  "fixed_cost_items",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    // "Miete", "Strom" — user content, never translated.
    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull(),
    activeFrom: text("active_from").notNull(),
    activeTo: text("active_to"),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("fixed_cost_items_household_active_idx").on(t.householdId, t.activeFrom, t.activeTo),
    check("fixed_cost_items_amount_positive", sql`${t.amountCents} > 0`),
    check("fixed_cost_items_from_format", sql`${t.activeFrom} glob '${sql.raw(PERIOD_GLOB)}'`),
    check(
      "fixed_cost_items_to_format",
      sql`${t.activeTo} is null or ${t.activeTo} glob '${sql.raw(PERIOD_GLOB)}'`,
    ),
    check("fixed_cost_items_range", sql`${t.activeTo} is null or ${t.activeTo} >= ${t.activeFrom}`),
  ],
);

export type FixedCostItemRow = typeof fixedCostItems.$inferSelect;
export type NewFixedCostItemRow = typeof fixedCostItems.$inferInsert;

/* -------------------------------------------------------------------------- */
/* incomes — temporal income per person                                     */
/* -------------------------------------------------------------------------- */

export const incomes = sqliteTable(
  "incomes",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("incomes_person_from_uidx").on(t.householdId, t.personId, t.validFrom),
    index("incomes_household_person_idx").on(t.householdId, t.personId, t.validFrom, t.validTo),
    check("incomes_amount_positive", sql`${t.amountCents} > 0`),
    check("incomes_from_format", sql`${t.validFrom} glob '${sql.raw(PERIOD_GLOB)}'`),
    check("incomes_to_format", sql`${t.validTo} is null or ${t.validTo} glob '${sql.raw(PERIOD_GLOB)}'`),
    check("incomes_range", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
  ],
);

export type IncomeRow = typeof incomes.$inferSelect;
export type NewIncomeRow = typeof incomes.$inferInsert;

/* -------------------------------------------------------------------------- */
/* fixed_cost_plans — one row per household                                 */
/* -------------------------------------------------------------------------- */

export const fixedCostPlans = sqliteTable(
  "fixed_cost_plans",
  {
    householdId: text("household_id")
      .primaryKey()
      .references(() => households.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    payerId: text("payer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    startPeriod: text("start_period").notNull(),
    // CACHE for the scan start, NOT the source of truth — see the
    // transactions_household_external_key_uidx comment.
    lastBookedPeriod: text("last_booked_period"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    check("fixed_cost_plans_start_format", sql`${t.startPeriod} glob '${sql.raw(PERIOD_GLOB)}'`),
    check(
      "fixed_cost_plans_last_format",
      sql`${t.lastBookedPeriod} is null or ${t.lastBookedPeriod} glob '${sql.raw(PERIOD_GLOB)}'`,
    ),
  ],
);

export type FixedCostPlanRow = typeof fixedCostPlans.$inferSelect;
export type NewFixedCostPlanRow = typeof fixedCostPlans.$inferInsert;

/* -------------------------------------------------------------------------- */
/* accrual_runs — audit log of the monthly runs, NOT the idempotency         */
/* -------------------------------------------------------------------------- */

export const accrualRuns = sqliteTable(
  "accrual_runs",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["boot", "interval", "manual", "import"] }).notNull(),
    fromPeriod: text("from_period"),
    toPeriod: text("to_period"),
    periodsBooked: integer("periods_booked").notNull(),
    periodsSkipped: integer("periods_skipped").notNull(),
    bookedCents: integer("booked_cents").notNull(),
    // English ops text, null on success.
    error: text("error"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at").notNull(),
  },
  (t) => [index("accrual_runs_household_started_idx").on(t.householdId, t.startedAt)],
);

export type AccrualRunRow = typeof accrualRuns.$inferSelect;
export type NewAccrualRunRow = typeof accrualRuns.$inferInsert;

/* -------------------------------------------------------------------------- */
/* password_reset_tokens — hashed, single-use                               */
/* -------------------------------------------------------------------------- */

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the mailed raw token — unlike invites.token, this is NEVER
    // stored in the clear (see the invites table comment above).
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_uidx").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRow = typeof passwordResetTokens.$inferInsert;

/* -------------------------------------------------------------------------- */
/* relations                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  householdMemberships: many(householdMembers),
}));

export const householdsRelations = relations(households, ({ many, one }) => ({
  members: many(householdMembers),
  invites: many(invites),
  categories: many(categories),
  tags: many(tags),
  transactions: many(transactions),
  fixedCostItems: many(fixedCostItems),
  incomes: many(incomes),
  plan: one(fixedCostPlans, {
    fields: [households.id],
    references: [fixedCostPlans.householdId],
  }),
  accrualRuns: many(accrualRuns),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, {
    fields: [householdMembers.householdId],
    references: [households.id],
  }),
  user: one(users, { fields: [householdMembers.userId], references: [users.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  household: one(households, { fields: [invites.householdId], references: [households.id] }),
  invitedByUser: one(users, { fields: [invites.invitedBy], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  household: one(households, { fields: [categories.householdId], references: [households.id] }),
  transactions: many(transactions),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  household: one(households, { fields: [tags.householdId], references: [households.id] }),
  transactionTags: many(transactionTags),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  household: one(households, { fields: [transactions.householdId], references: [households.id] }),
  payer: one(users, { fields: [transactions.payerId], references: [users.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  tags: many(transactionTags),
}));

export const transactionTagsRelations = relations(transactionTags, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionTags.transactionId],
    references: [transactions.id],
  }),
  tag: one(tags, { fields: [transactionTags.tagId], references: [tags.id] }),
}));

export const fixedCostItemsRelations = relations(fixedCostItems, ({ one }) => ({
  household: one(households, { fields: [fixedCostItems.householdId], references: [households.id] }),
}));

export const incomesRelations = relations(incomes, ({ one }) => ({
  household: one(households, { fields: [incomes.householdId], references: [households.id] }),
  person: one(users, { fields: [incomes.personId], references: [users.id] }),
}));

export const fixedCostPlansRelations = relations(fixedCostPlans, ({ one }) => ({
  household: one(households, { fields: [fixedCostPlans.householdId], references: [households.id] }),
  payer: one(users, { fields: [fixedCostPlans.payerId], references: [users.id] }),
}));

export const accrualRunsRelations = relations(accrualRuns, ({ one }) => ({
  household: one(households, { fields: [accrualRuns.householdId], references: [households.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const mutationClaimsRelations = relations(mutationClaims, ({ one }) => ({
  household: one(households, { fields: [mutationClaims.householdId], references: [households.id] }),
  transaction: one(transactions, {
    fields: [mutationClaims.transactionId],
    references: [transactions.id],
  }),
}));
