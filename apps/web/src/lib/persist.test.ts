/**
 * The offline-cache allow-list and the per-account key.
 *
 * These are the two things that stand between "erfassen funktioniert offline"
 * and "person B sees person A's ledger on a shared tablet", so they get
 * pinned down here rather than only in the prose of persist.ts.
 *
 * Pure functions only — `bun test` has no IndexedDB, and the storage helpers
 * already degrade silently without `window` (see lib/storage.ts).
 */
import { describe, expect, test } from "bun:test";
import { cacheKeyForUser, shouldPersistMutation, shouldPersistQuery } from "./persist";

type QueryLike = Parameters<typeof shouldPersistQuery>[0];

/** A successful query with some data, which is the only persistable shape. */
function query(queryKey: readonly unknown[], overrides: Partial<QueryLike["state"]> = {}): QueryLike {
  return {
    queryKey: queryKey as QueryLike["queryKey"],
    state: { status: "success", data: { items: [] }, ...overrides } as QueryLike["state"],
  };
}

describe("cacheKeyForUser", () => {
  test("namespaces by user id — two accounts can never read one blob", () => {
    expect(cacheKeyForUser("a1")).toBe("user:a1");
    expect(cacheKeyForUser("a1")).not.toBe(cacheKeyForUser("b2"));
  });
});

describe("shouldPersistQuery — what MAY be written", () => {
  const householdId = "11111111-1111-4111-8111-111111111111";

  test("transactions, plan, categories, tags, balance", () => {
    for (const segment of [
      "transactions",
      "transaction",
      "transaction-summary",
      "categories",
      "tags",
      "plan",
      "balance",
    ]) {
      expect(shouldPersistQuery(query(["toon", "household", householdId, segment]))).toBe(true);
    }
  });

  test("a transaction list WITH filters (the key carries a filter object)", () => {
    expect(
      shouldPersistQuery(query(["toon", "household", householdId, "transactions", { sort: "-bookedAt" }])),
    ).toBe(true);
  });

  test("the bootstrap payload, because offline needs to know who is signed in", () => {
    expect(shouldPersistQuery(query(["toon", "me"]))).toBe(true);
  });
});

describe("shouldPersistQuery — what may NOT be written", () => {
  const householdId = "11111111-1111-4111-8111-111111111111";

  test("security surfaces that must always be live", () => {
    expect(shouldPersistQuery(query(["toon", "sessions"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "invite", "token"]))).toBe(false);
  });

  test("household listings, members and invites (not needed offline, so not stored)", () => {
    expect(shouldPersistQuery(query(["toon", "households"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "household", householdId, "members"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "household", householdId, "invites"]))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "household", householdId, "detail"]))).toBe(false);
  });

  test("an UNKNOWN key — the list is allow, not deny, so new endpoints are excluded", () => {
    expect(shouldPersistQuery(query(["toon", "household", householdId, "settlements"]))).toBe(false);
    expect(shouldPersistQuery(query(["something-else", "transactions"]))).toBe(false);
    expect(shouldPersistQuery(query([]))).toBe(false);
  });

  test("a pending or failed query — restoring it would read as 'no transactions'", () => {
    expect(
      shouldPersistQuery(query(["toon", "household", householdId, "transactions"], { status: "pending" })),
    ).toBe(false);
    expect(
      shouldPersistQuery(query(["toon", "household", householdId, "transactions"], { status: "error" })),
    ).toBe(false);
  });

  test("a successful but empty `me` (logged out) is not worth storing", () => {
    expect(shouldPersistQuery(query(["toon", "me"], { data: null }))).toBe(false);
    expect(shouldPersistQuery(query(["toon", "me"], { data: undefined }))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* the write half: queued offline mutations                                   */
/* -------------------------------------------------------------------------- */

type MutationLike = Parameters<typeof shouldPersistMutation>[0];

function mutation(
  mutationKey: readonly unknown[] | undefined,
  overrides: Partial<MutationLike["state"]> = {},
): MutationLike {
  return {
    options: { mutationKey },
    state: { status: "pending", isPaused: true, ...overrides },
  };
}

describe("shouldPersistMutation", () => {
  test("a PAUSED transaction mutation is queued for replay", () => {
    expect(shouldPersistMutation(mutation(["toon", "tx", "create"]))).toBe(true);
    expect(shouldPersistMutation(mutation(["toon", "tx", "delete"]))).toBe(true);
  });

  /**
   * The whole point: a mutation that already reached the server must not be
   * re-run on the next launch. The API's mutation-claims ledger catches a
   * duplicate for calls that carry a mutationId, but this is the first line
   * of defence.
   */
  test("a mutation that is NOT paused is never persisted", () => {
    expect(shouldPersistMutation(mutation(["toon", "tx", "create"], { isPaused: false }))).toBe(false);
    expect(
      shouldPersistMutation(mutation(["toon", "tx", "create"], { isPaused: false, status: "success" })),
    ).toBe(false);
  });

  test("plan mutations are excluded — a late-replayed plan change is not a nicety", () => {
    expect(shouldPersistMutation(mutation(["toon", "plan", "run"]))).toBe(false);
    expect(shouldPersistMutation(mutation(["toon", "auth", "logout"]))).toBe(false);
    expect(shouldPersistMutation(mutation(["toon", "household", "update"]))).toBe(false);
  });

  test("an unkeyed or foreign mutation is excluded", () => {
    expect(shouldPersistMutation(mutation(undefined))).toBe(false);
    expect(shouldPersistMutation(mutation([]))).toBe(false);
    expect(shouldPersistMutation(mutation(["other", "tx"]))).toBe(false);
  });
});
