/**
 * The single place the rest of the API gets a `Mailer` from.
 *
 * `getMailer()` builds the adapter selected by `MAIL_TRANSPORT` once,
 * `setMailer()` replaces it (the seam tests use to inject a fake and never
 * open a socket — see CLAUDE.md's `mock.module` gotcha for why this is a
 * setter and not a mock), and `trySendMail()` is the call every feature
 * actually uses, because a failed send may never break the action that
 * triggered it (docs/spec.md §3.5).
 */
import type { MailDelivery } from "@toon/shared";
import { env } from "../../env.ts";
import { ConsoleMailer } from "./console.ts";
import { SmtpMailer } from "./smtp.ts";

export interface MailMessage {
  /** A single recipient address. */
  to: string;
  subject: string;
  /** Plain-text body — the only body this app sends (no HTML mail templates). */
  text: string;
}

export interface Mailer {
  /**
   * Delivers `message`. May reject: every caller wraps this in
   * {@link trySendMail} and treats a failure as non-fatal.
   */
  send(message: MailMessage): Promise<void>;
  /** Short label for logs and diagnostics ("console", "smtp"). */
  readonly name: string;
}

export interface MailSendResult {
  delivered: boolean;
  /** Adapter that handled (or refused) the message. */
  transport: string;
  /** English, log-safe reason when `delivered` is false. */
  error?: string;
}

export { ConsoleMailer } from "./console.ts";
export { SmtpMailer, type SmtpConfig, type SmtpSecurity } from "./smtp.ts";
export * from "./templates.ts";

let mailer: Mailer | null = null;

function buildMailer(): Mailer {
  if (env.mailTransport === "smtp") {
    // env.ts already refused to boot without MAIL_HOST/MAIL_FROM, and the
    // credentials-over-plaintext combination was refused there too.
    return new SmtpMailer({
      host: env.MAIL_HOST ?? "",
      port: env.mailPort,
      security: env.mailSecurity,
      user: env.MAIL_USER,
      password: env.MAIL_PASSWORD,
      from: env.mailFrom,
      allowInsecureTls: env.MAIL_TLS_INSECURE === true,
    });
  }
  // Silent under `bun test`: dozens of invite/reset mails printed in full
  // would bury the actual test output. Tests that care read `ConsoleMailer.sent`.
  return env.isTest ? new ConsoleMailer(() => undefined) : new ConsoleMailer();
}

/** The shared mailer, created on first use. */
export function getMailer(): Mailer {
  mailer ??= buildMailer();
  return mailer;
}

/** Replaces the shared mailer. Pass `null` to restore the configured adapter. */
export function setMailer(next: Mailer | null): void {
  mailer = next;
}

/**
 * Sends a message and NEVER throws.
 *
 * Every caller in this codebase is an action whose value does not depend on
 * the mail arriving: an invite is valid because the row exists and the link
 * was returned; `POST /password/forgot` answers 204 regardless so it cannot
 * be used to probe for accounts. So the failure is logged with its reason and
 * reported back as data, not raised.
 */
export async function trySendMail(message: MailMessage): Promise<MailSendResult> {
  const active = getMailer();
  try {
    await active.send(message);
    return { delivered: true, transport: active.name };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[mail] Sending to ${redactAddress(message.to)} failed (${active.name}): ${reason}`);
    return { delivered: false, transport: active.name, error: reason };
  }
}

/**
 * Turns a send result into the three-state status the contract exposes.
 *
 * The ConsoleMailer RESOLVES — it logged the message, that is its job — so
 * `delivered` alone would report "no mail configured" as a successful send.
 * The transport name is what separates the two, and it lives here so every
 * endpoint answers the same way (docs/spec.md §3.5).
 */
export function mailDeliveryOf(result: MailSendResult): MailDelivery {
  if (result.transport === "console") return "not_configured";
  return result.delivered ? "sent" : "failed";
}

/** `max@beispiel.de` -> `m***@beispiel.de` — a failed-send log line should not leak an address. */
export function redactAddress(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address.slice(0, 1)}***${address.slice(at)}`;
}
