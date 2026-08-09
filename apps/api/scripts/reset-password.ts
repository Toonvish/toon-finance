#!/usr/bin/env bun
/**
 * `bun run scripts/reset-password.ts <email>` — operator escape hatch for a
 * self-hosted install with no MAIL_TRANSPORT configured. Mints the exact same
 * token `POST /api/auth/password/forgot` would, and prints the finished link
 * instead of mailing it, so a locked-out household member can be unblocked
 * from the server console.
 */
import { client, db } from "../src/db/client.ts";
import { env } from "../src/env.ts";
import { createPasswordResetToken } from "../src/services/auth/passwordReset.ts";
import { findUserByEmail } from "../src/services/auth/users.service.ts";

const email = process.argv[2];
if (!email) {
  console.error("usage: bun run scripts/reset-password.ts <email>");
  process.exit(1);
}

const user = await findUserByEmail(db, email);
if (!user) {
  console.error(`[reset-password] no account for ${email}`);
  await client.close();
  process.exit(1);
}

const { token, expiresAt } = await createPasswordResetToken(db, user.id);
const origin = (env.webOrigins[0] ?? "").replace(/\/+$/, "");
console.log(`[reset-password] link for ${email} (expires ${new Date(expiresAt).toISOString()}):`);
console.log(`${origin}/reset-password/${token}`);

await client.close();
