/**
 * Offline persistence of the TanStack Query cache — the "erfassen funktioniert
 * ohne Netz" half of the app.
 *
 * Reads are cached for every screen on the allow-list ({@link shouldPersistQuery}).
 * WRITES are cached for exactly one namespace: paused `["toon","tx",…]`
 * transaction mutations (registered by `features/transactions/lib/offline.ts`,
 * [OFFLINE]), so a booking made in a cellar with no signal can be ticked in
 * and replayed on reconnect. Everything else — auth, household, category,
 * and above all the FIXED-COST PLAN — stays read-only offline
 * (CLAUDE.md gotcha #9: "ein Tage später abgespieltes 'Plan geändert' ist
 * keine Nettigkeit").
 *
 * ## THE DATA-LEAK GUARD, WHICH IS THE POINT OF THIS FILE
 *
 * A persisted cache keyed only by query key would show PERSON A's LEDGER TO
 * PERSON B after a logout/login on a shared phone or tablet: the keys are
 * identical (`["toon","household",<id>,…]` — the household is shared by
 * definition!), and a restore happens before any network call can correct
 * it. Four rules prevent that, and all four have to hold.
 *
 *  1. **The IndexedDB key contains the user id** ({@link cacheKeyForUser}), so
 *     two accounts cannot read each other's blob at all, even though they see
 *     the same household.
 *  2. **The key follows the CURRENT user at write time.** The persister reads
 *     {@link setActiveCacheUser}'s module state on every call instead of
 *     closing over an id — a persister bound at boot would keep saving
 *     account B's freshly loaded ledger under account A's key.
 *  3. **Switching accounts purges first.** {@link setActiveCacheUser} clears
 *     the store whenever the id actually changes, and logout calls it with
 *     `null`.
 *  4. **An allow-list decides what is written at all**
 *     ({@link shouldPersistQuery}), so an endpoint added later is excluded by
 *     default rather than silently persisted.
 *
 * ## WHY `/api/auth/me` IS PERSISTED (it is the one judgement call here)
 *
 * Without it there is no offline mode at all: an installed app opened in
 * airplane mode cannot reach `/api/auth/me`, so it would never learn who is
 * signed in, never render past `RequireAuth`, and never show the balance it
 * has cached. So the bootstrap payload is persisted too — inside the
 * per-user, purge-on-logout blob above.
 *
 * What that does NOT do is grant access. A restored session is data on a
 * device that already held it; the cookie is still the only thing the API
 * accepts, every write goes to the server, and a 401 clears the cache and
 * redirects to `/login` (`handleUnauthorized` in `lib/api.ts`).
 * `refetchOnReconnect` re-checks the real session the moment there is a
 * connection again.
 *
 * Still excluded: `["toon","sessions"]` (a security surface that must always
 * be live) and anything mid-edit that has to come from the server.
 */
import type { Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { readStorage, storageKeys, writeStorage } from "./storage";

const DB_NAME = "toon-finance";
const DB_VERSION = 1;
const STORE_NAME = "query-cache";

/** How long a persisted cache may still be restored after it was written. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bumped whenever a change would make an old blob wrong (a query-key rename,
 * a response-shape change). A mismatch makes the persister discard the blob
 * instead of hydrating stale-shaped data into components that no longer
 * understand it.
 */
export const PERSIST_BUSTER = "v1";

/** IndexedDB key of one account's cache. */
export function cacheKeyForUser(userId: string): string {
  return `user:${userId}`;
}

/* -------------------------------------------------------------------------- */
/* which account the cache belongs to                                        */
/* -------------------------------------------------------------------------- */

/**
 * Id of the account the cache is being written for.
 *
 * Seeded from localStorage so a cold, OFFLINE start knows which blob to
 * restore before any network call — that is the whole reason the pointer is
 * stored outside IndexedDB. It is a pointer, never data: worthless on its own.
 */
let activeUserId: string | null = readStorage(storageKeys.lastUserId);

/** The account the persister currently reads and writes. */
export function activeCacheUser(): string | null {
  return activeUserId;
}

/**
 * Points the cache at `userId` (or at nobody, on logout).
 *
 * PURGES whenever the id actually changes — including on logout — so a
 * second person on the same phone can never end up reading the first one's
 * blob, and so a signed-out device stops holding ledger data at all. Safe to
 * call on every render of the session provider: an unchanged id does nothing.
 */
export function setActiveCacheUser(userId: string | null): void {
  if (userId === activeUserId) return;
  activeUserId = userId;
  writeStorage(storageKeys.lastUserId, userId);
  void purgePersistedCache();
}

/* -------------------------------------------------------------------------- */
/* raw IndexedDB                                                             */
/* -------------------------------------------------------------------------- */

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB.open failed"));
    request.onblocked = () => reject(new Error("indexedDB.open blocked"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    const fail = () => {
      database.close();
      reject(transaction.error ?? new Error("indexedDB transaction failed"));
    };
    transaction.onabort = fail;
    transaction.onerror = fail;
  });
}

/** True when this browser can persist at all (private-mode Safari cannot). */
export function isPersistenceAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/* -------------------------------------------------------------------------- */
/* what may be persisted (reads)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Household-scoped segments that are useful offline. Keys look like
 * `["toon","household",<householdId>,<segment>,…]`.
 *
 * `members` and `invites` are absent: neither is needed to render the
 * balance-first offline experience, and an invite link is a capability worth
 * keeping live only.
 */
const PERSISTED_HOUSEHOLD_SEGMENTS = new Set([
  "transactions",
  "transaction",
  "transaction-summary",
  "categories",
  "tags",
  "plan",
  "balance",
]);

/** The bootstrap payload — see "WHY /api/auth/me IS PERSISTED" in the header. */
function isBootstrapKey(key: readonly unknown[]): boolean {
  return key[1] === "me" && key.length === 2;
}

/** The allow-list. Everything not named here stays in memory only. */
export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  // Never persist a pending or failed query: it would restore as "no
  // transactions" rather than as "not loaded yet", which reads as data loss.
  if (query.state.status !== "success") return false;
  // `me` legitimately resolves to null (logged out) — not worth storing.
  if (query.state.data === null || query.state.data === undefined) return false;

  const key = query.queryKey;
  if (!Array.isArray(key) || key[0] !== "toon") return false;
  if (isBootstrapKey(key)) return true;
  if (key[1] !== "household") return false;
  const segment = key[3];
  return typeof segment === "string" && PERSISTED_HOUSEHOLD_SEGMENTS.has(segment);
}

/* -------------------------------------------------------------------------- */
/* the WRITE half: queued offline mutations                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mutation-key namespaces whose PAUSED state is persisted, so a booking made
 * in airplane mode survives the app being killed and is replayed on
 * reconnect.
 *
 * Deliberately a tiny allow-list rather than "all mutations". Three things
 * have to hold for a namespace to belong here:
 *
 *  1. **The mutation must be registered with `setMutationDefaults`.** A
 *     dehydrated mutation carries its VARIABLES but not its `mutationFn` — a
 *     function cannot be serialised. Without a default registered for the
 *     key at app start, a restored mutation has nothing to run and
 *     `resumePausedMutations()` throws.
 *  2. **The server endpoint must be replay-safe.** Every queued mutation
 *     carries a client-minted `mutationId`, and `mutation_claims` applies
 *     each id at most once (docs/spec.md §2.9) — otherwise a replayed
 *     "Buchung erfassen" would silently double an expense.
 *  3. **A stale replay must not be destructive.** A booking made offline and
 *     replayed hours later is still correct; auth, household and — above
 *     all — fixed-cost PLAN mutations are excluded and must stay excluded
 *     (CLAUDE.md gotcha #9): a plan change replayed after the other person
 *     has already seen and relied on the old numbers is not a nicety.
 *
 * Only `tx` (transactions, [OFFLINE]) currently satisfies all three.
 */
const PERSISTED_MUTATION_NAMESPACES = new Set(["tx"]);

/**
 * Only PAUSED mutations are worth persisting: a settled one has already
 * reached the server, and re-running it on the next launch is exactly the
 * double-apply the idempotency ledger exists to prevent.
 */
export function shouldPersistMutation(mutation: {
  state: { status: string; isPaused: boolean };
  options: { mutationKey?: readonly unknown[] | undefined };
}): boolean {
  if (!mutation.state.isPaused) return false;
  const key = mutation.options.mutationKey;
  if (!Array.isArray(key) || key[0] !== "toon") return false;
  return typeof key[1] === "string" && PERSISTED_MUTATION_NAMESPACES.has(key[1]);
}

/* -------------------------------------------------------------------------- */
/* persister                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The single {@link Persister} for the app, stored under the CURRENT
 * {@link activeCacheUser}'s key — see rule 2 in the header for why the id is
 * read per call rather than captured.
 *
 * Every operation swallows its own failure: persistence is a nicety, and a
 * browser that refuses IndexedDB (private mode, disabled storage, exhausted
 * quota) must degrade to "online only", never break the app.
 */
export function createIndexedDbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const userId = activeCacheUser();
      if (userId === null || !isPersistenceAvailable()) return;
      try {
        await withStore("readwrite", (store) => store.put(client, cacheKeyForUser(userId)));
      } catch {
        /* out of quota / storage disabled — stay online-only */
      }
    },
    restoreClient: async () => {
      const userId = activeCacheUser();
      if (userId === null || !isPersistenceAvailable()) return undefined;
      try {
        return await withStore<PersistedClient | undefined>("readonly", (store) =>
          store.get(cacheKeyForUser(userId)),
        );
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      await purgePersistedCache();
    },
  };
}

/**
 * Deletes EVERY persisted cache, whoever it belongs to.
 *
 * Deliberately not "delete the current key": on a shared device the person
 * logging out is the one who cares, and a leftover blob from an earlier
 * account is exactly what this feature must not accumulate.
 */
export async function purgePersistedCache(): Promise<void> {
  if (!isPersistenceAvailable()) return;
  try {
    await withStore("readwrite", (store) => store.clear());
  } catch {
    /* nothing we can do, and nothing worth breaking logout over */
  }
}
