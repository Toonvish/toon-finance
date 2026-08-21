/**
 * Shared transaction plumbing every service (auth, households, and later the
 * ledger/plan services) builds on.
 */
import type { Database } from "../db/client.ts";
import { env } from "../env.ts";

/** The transaction handle drizzle hands to `db.transaction(cb)`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Anything that can run queries: the pooled drizzle instance or a
 * transaction. Every service function takes this so it can be composed
 * inside a transaction and so tests can pass an isolated in-memory database.
 */
export type DbLike = Database | Tx;

/**
 * KNOWN LIBSQL LIMITATION (verified with @libsql/client 0.17.4 + Bun 1.3.14,
 * re-verified unchanged with Bun 1.4.0):
 * `client.transaction()` opens a SECOND connection, and for an in-memory URL
 * (`file::memory:`) that second connection is a brand-new, EMPTY database —
 * after the transaction commits, every table is gone. File-backed databases
 * (self-hosted `file:./data/local.db`) and Turso are unaffected.
 *
 * This is why `TEST_DATABASE_URL` should point at a temporary FILE for any
 * test that touches a transaction (docs/spec.md task brief, CLAUDE.md): a
 * ledger whose integration tests never see a real transaction does not test
 * its most important property. Tests that use the default `file::memory:`
 * still exercise the full write order — `withTransaction` degrades to
 * sequential statements there — just not the rollback guarantee.
 */
export const transactionsSupported: boolean = !env.databaseUrl.includes(":memory:");

/** Runs `work` inside a transaction wherever libSQL supports one (see above). */
export async function withTransaction<T>(db: Database, work: (tx: DbLike) => Promise<T>): Promise<T> {
  if (!transactionsSupported) return work(db);
  return db.transaction(async (tx) => work(tx));
}
