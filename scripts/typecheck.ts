/**
 * Type-checks every workspace package sequentially. Fails with a non-zero exit
 * code if any package has type errors.
 */
const packages = ["packages/shared", "apps/api", "apps/web"];
const root = new URL("../", import.meta.url).pathname;

let failed = false;
for (const pkg of packages) {
  console.log(`[typecheck] ${pkg}`);
  const proc = Bun.spawn(["bunx", "tsc", "-p", "tsconfig.json", "--noEmit"], {
    cwd: `${root}${pkg}`,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) failed = true;
}

if (failed) {
  console.error("[typecheck] FAILED");
  process.exit(1);
}
console.log("[typecheck] OK");
