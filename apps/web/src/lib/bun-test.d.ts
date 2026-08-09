/**
 * Minimal ambient declaration for `bun:test`.
 *
 * `apps/web/tsconfig.json` sets `types: ["vite/client"]`, so the Bun test
 * globals are not part of this program — without this shim every
 * `apps/web/src/**` test file would fail `tsc` with TS2307 even though
 * `bun test` runs them fine.
 *
 * It is a SUBSET of the real API, so a matcher that works under `bun test`
 * can still fail `tsc` here — add it below rather than rewriting the
 * assertion.
 */
declare module "bun:test" {
  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toThrow(expected?: unknown): void;
    readonly not: Matchers;
  }

  export function describe(label: string, body: () => void): void;
  export function test(label: string, body: () => unknown): void;
  export function it(label: string, body: () => unknown): void;
  /**
   * The optional second argument is Bun's assertion LABEL, printed on
   * failure. It matters for a matcher inside a loop, where the default
   * output ("expected false to be true") does not say which iteration
   * failed.
   */
  export function expect(actual: unknown, message?: string): Matchers;
  export function beforeEach(body: () => unknown): void;
  export function afterEach(body: () => unknown): void;
  export function afterAll(body: () => unknown): void;
}
