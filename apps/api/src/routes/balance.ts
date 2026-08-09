/**
 * Mounted at /api/households/:householdId/balance (see src/index.ts). The
 * balance and its sub-totals; the sign convention and derivation live in
 * `@toon/shared`'s `computeBreakdown` — this router only wires the request.
 */
import { zValidator } from "@hono/zod-validator";
import { BalanceHistoryQuerySchema, BalanceQuerySchema, type BalanceHistoryResponse } from "@toon/shared";
import { Hono } from "hono";
import { db } from "../db/client.ts";
import { json } from "../lib/http.ts";
import type { AppEnv } from "../lib/types.ts";
import { requireHousehold as requireHouseholdContext } from "../lib/types.ts";
import { onValidationError } from "../lib/validation.ts";
import { requireHousehold } from "../middleware/household.ts";
import { requireSession } from "../middleware/session.ts";
import { getBalance, getBalanceHistory } from "../services/ledger/balance.service.ts";

export const balanceRoutes = new Hono<AppEnv>();

balanceRoutes.use("*", requireSession());
balanceRoutes.use("*", requireHousehold());

/** GET /?includeAggregates= — the current balance, from the viewer's perspective AND slot 1's. */
balanceRoutes.get("/", zValidator("query", BalanceQuerySchema, onValidationError), async (c) => {
  const household = requireHouseholdContext(c);
  const query = c.req.valid("query");
  const payload = await getBalance(db, household.householdId, household.userId, household.memberSlot, query.includeAggregates);
  return json(c, payload);
});

/** GET /history?from=&to=&includeAggregates= — a running balance per period. */
balanceRoutes.get("/history", zValidator("query", BalanceHistoryQuerySchema, onValidationError), async (c) => {
  const household = requireHouseholdContext(c);
  const query = c.req.valid("query");
  const items = await getBalanceHistory(db, household.householdId, query.from, query.to, query.includeAggregates);
  const payload: BalanceHistoryResponse = { items };
  return json(c, payload);
});

export default balanceRoutes;
