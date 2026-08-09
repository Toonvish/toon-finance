/**
 * SMTP adapter — the transport for a self-hosted install. Points at the
 * Mailpit container in the compose stack by default; point the same config
 * at a real relay (`MAIL_SECURITY=starttls`, port 587, user + password) and
 * nothing else changes.
 *
 * WHY THERE IS NO DEPENDENCY HERE: the same reason `Bun.password` does the
 * argon2 hashing. What this app sends is one short German notice with one
 * link, to one recipient, with no attachments — that is
 * EHLO/STARTTLS/AUTH/MAIL/RCPT/DATA and nothing else. `node:net` + `node:tls`
 * cover it in a file you can read in one sitting.
 *
 * FOUR THINGS THAT ARE EASY TO GET WRONG AND ARE HANDLED HERE:
 *
 *  1. HEADER INJECTION. `to` and `subject` end up in raw headers, so a CR or
 *     LF in either would let the value inject its own headers. Both are
 *     rejected outright.
 *  2. NON-ASCII SUBJECTS. Every subject this app sends is German, so a raw
 *     8-bit header would arrive as mojibake or be rejected outright. Subjects
 *     become RFC 2047 encoded-words, chunked on CHARACTER boundaries so a
 *     split never cuts an umlaut in half.
 *  3. THE DATA TERMINATOR. The body is base64 (7-bit, fixed line length), so
 *     no line can start with "." and `\r\n.\r\n` cannot be forged from
 *     content. `dotStuff()` still runs over the whole payload.
 *  4. THE STARTTLS HANDOFF. The capability list from the plaintext phase is
 *     re-read after the upgrade (RFC 3207 §4.2), the plaintext listeners come
 *     off the socket before `tls.connect()` adopts it, and a relay that does
 *     not offer STARTTLS on a port we were told to encrypt gets no
 *     credentials at all.
 */
import { randomUUID } from "node:crypto";
import { createConnection, isIP, type Socket } from "node:net";
import { StringDecoder } from "node:string_decoder";
import { connect as connectTls, type TLSSocket } from "node:tls";
import type { MailMessage, Mailer } from "./index.ts";

/** How TLS is obtained. `none` is only for a relay on a private network. */
export type SmtpSecurity = "starttls" | "tls" | "none";

export interface SmtpConfig {
  host: string;
  port: number;
  security: SmtpSecurity;
  /** Omitted for a relay that does not authenticate (Mailpit). */
  user?: string;
  password?: string;
  /** Envelope sender + `From:` header, "Name <address>" or a bare address. */
  from: string;
  /** True to accept a self-signed relay certificate. */
  allowInsecureTls?: boolean;
  /** Hard cap on one delivery attempt. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

interface SmtpReply {
  code: number;
  text: string;
}

export class SmtpMailer implements Mailer {
  readonly name = "smtp";

  constructor(private readonly config: SmtpConfig) {}

  async send(message: MailMessage): Promise<void> {
    const timeout = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let deadline: Timer | undefined;
    try {
      await Promise.race([
        this.deliver(message),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error(`SMTP timeout after ${timeout} ms`)), timeout);
        }),
      ]);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
  }

  private async deliver(message: MailMessage): Promise<void> {
    const to = requireHeaderSafe(message.to, "recipient address");
    const from = requireHeaderSafe(this.config.from, "sender address");
    const payload = buildMessage({ ...message, to }, from);

    const wire = await Wire.open(this.config);
    try {
      await wire.expect(220);
      let greeting = await wire.command(`EHLO ${clientHostname(from)}`, 250);

      if (this.config.security === "starttls") {
        // Fail closed: a relay that does not offer STARTTLS on a port we
        // were told to encrypt is either misconfigured or being stripped by
        // a middlebox. Carrying on in plaintext is how credentials leak.
        if (!advertises(greeting, "STARTTLS")) {
          throw new Error(
            `${this.config.host}:${this.config.port} does not offer STARTTLS - use MAIL_SECURITY=tls (port 465) or =none (private network only)`,
          );
        }
        await wire.command("STARTTLS", 220);
        await wire.upgradeToTls(this.config);
        greeting = await wire.command(`EHLO ${clientHostname(from)}`, 250);
      }

      if ((this.config.user ?? "").length > 0) await this.authenticate(wire, greeting);

      await wire.command(`MAIL FROM:<${addressOf(from)}>`, 250);
      await wire.command(`RCPT TO:<${addressOf(to)}>`, [250, 251]);
      await wire.command("DATA", 354);
      await wire.command(`${dotStuff(payload)}\r\n.`, 250);
      // QUIT is best-effort: the mail is accepted as of the 250 above, so a
      // relay that drops the connection instead of answering has cost us
      // nothing.
      await wire.command("QUIT", 221).catch(() => undefined);
    } finally {
      wire.close();
    }
  }

  /** AUTH PLAIN when advertised, AUTH LOGIN otherwise. */
  private async authenticate(wire: Wire, greeting: SmtpReply): Promise<void> {
    const user = this.config.user ?? "";
    const password = this.config.password ?? "";
    const mechanisms = authMechanisms(greeting);

    if (mechanisms.length > 0 && !mechanisms.includes("PLAIN") && !mechanisms.includes("LOGIN")) {
      throw new Error(`${this.config.host} only supports AUTH ${mechanisms.join("/")} - PLAIN or LOGIN is required`);
    }

    if (mechanisms.length === 0 || mechanisms.includes("PLAIN")) {
      // RFC 4616: authzid NUL authcid NUL passwd, with an empty authzid.
      await wire.command(`AUTH PLAIN ${base64(`\0${user}\0${password}`)}`, 235);
      return;
    }

    await wire.command("AUTH LOGIN", 334);
    await wire.command(base64(user), 334);
    await wire.command(base64(password), 235);
  }
}

/* -------------------------------------------------------------------------- */
/* the wire                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One SMTP connection, as a request/response channel.
 *
 * SMTP replies are line-based and may be multiline, so every read keeps
 * buffering until it sees a line whose 4th character is a SPACE rather than
 * a hyphen. Replies that arrive before anyone asks for them are QUEUED, not
 * dropped — a relay may pipeline, and the 220 greeting routinely lands
 * before the first `expect()` runs.
 *
 * Bytes are decoded through a `StringDecoder` rather than
 * `socket.setEncoding()` so the socket keeps handing out Buffers:
 * `tls.connect({ socket })` adopts this socket during the STARTTLS upgrade
 * and would receive pre-decoded strings otherwise, which corrupts the
 * handshake.
 */
class Wire {
  private buffer = "";
  private lines: string[] = [];
  private decoder = new StringDecoder("utf8");
  private readonly queue: SmtpReply[] = [];
  private waiter: { resolve: (reply: SmtpReply) => void; reject: (error: Error) => void } | null = null;
  private failure: Error | null = null;
  private closed = false;

  private constructor(private socket: Socket | TLSSocket) {
    this.attach(socket);
  }

  static async open(config: SmtpConfig): Promise<Wire> {
    const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
      const settle = (): void => {
        pending.off("error", onError);
        // The connect-phase timeout handler rejects; from here on a stall
        // must destroy the socket instead, so it is replaced rather than
        // stacked.
        pending.removeAllListeners("timeout");
        pending.setTimeout(timeout, () => pending.destroy(new Error(`SMTP timeout (${config.host}:${config.port})`)));
        resolve(pending);
      };
      const onError = (error: Error): void => reject(wrapNetworkError(config, error));
      const pending: Socket | TLSSocket =
        config.security === "tls"
          ? connectTls(
              { host: config.host, port: config.port, ...sni(config.host), rejectUnauthorized: config.allowInsecureTls !== true },
              settle,
            )
          : createConnection({ host: config.host, port: config.port }, settle);
      pending.once("error", onError);
      pending.setTimeout(timeout, () => {
        pending.destroy();
        reject(new Error(`Connection to ${config.host}:${config.port} did not respond`));
      });
    });
    return new Wire(socket);
  }

  private attach(socket: Socket | TLSSocket): void {
    socket.on("data", (chunk: Buffer) => this.consume(this.decoder.write(chunk)));
    socket.on("error", (error: Error) => this.fail(error));
    socket.on("close", () => {
      this.closed = true;
      this.fail(new Error("Connection was closed by the SMTP server"));
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const end = this.buffer.indexOf("\r\n");
      if (end === -1) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      this.lines.push(line);
      // A multiline reply continues while the separator is "-"; the final
      // line uses a space (RFC 5321 §4.2.1).
      if (line.length >= 4 && line[3] === "-") continue;
      const reply: SmtpReply = {
        code: Number.parseInt(this.lines[0]?.slice(0, 3) ?? "0", 10),
        text: this.lines.map((entry) => entry.slice(4)).join("\n"),
      };
      this.lines = [];
      this.deliver(reply);
    }
  }

  private deliver(reply: SmtpReply): void {
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter.resolve(reply);
      return;
    }
    this.queue.push(reply);
  }

  private fail(error: Error): void {
    this.failure ??= error;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter.reject(this.failure);
    }
  }

  private read(): Promise<SmtpReply> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise<SmtpReply>((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  async expect(codes: number | number[]): Promise<SmtpReply> {
    const wanted = Array.isArray(codes) ? codes : [codes];
    const reply = await this.read();
    if (!wanted.includes(reply.code)) {
      throw new Error(`SMTP ${reply.code}: ${reply.text.slice(0, 300)}`);
    }
    return reply;
  }

  async command(line: string, codes: number | number[]): Promise<SmtpReply> {
    if (this.closed) throw this.failure ?? new Error("SMTP connection is closed");
    await new Promise<void>((resolve, reject) => {
      this.socket.write(`${line}\r\n`, "utf8", (error) => (error ? reject(error) : resolve()));
    });
    return this.expect(codes);
  }

  /** Replaces the plaintext socket with a TLS one after a 220 to STARTTLS. */
  async upgradeToTls(config: SmtpConfig): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("error");
    plain.removeAllListeners("close");

    const secure = await new Promise<TLSSocket>((resolve, reject) => {
      const upgraded = connectTls(
        { socket: plain, ...sni(config.host), rejectUnauthorized: config.allowInsecureTls !== true },
        () => {
          upgraded.off("error", reject);
          resolve(upgraded);
        },
      );
      upgraded.once("error", reject);
    });

    this.socket = secure;
    this.buffer = "";
    this.lines = [];
    this.decoder = new StringDecoder("utf8");
    this.attach(secure);
  }

  close(): void {
    this.closed = true;
    this.socket.destroy();
  }
}

/** The SNI server name for a TLS handshake — omitted for a bare IP. */
function sni(host: string): { servername?: string } {
  return isIP(host) === 0 ? { servername: host } : {};
}

/** `ECONNREFUSED` alone tells an operator nothing; the address is the useful part. */
function wrapNetworkError(config: SmtpConfig, error: Error): Error {
  const code = (error as NodeJS.ErrnoException).code;
  return new Error(`SMTP connection to ${config.host}:${config.port} failed${code ? ` (${code})` : ""}: ${error.message}`);
}

/* -------------------------------------------------------------------------- */
/* message building                                                            */
/* -------------------------------------------------------------------------- */

function advertises(greeting: SmtpReply, keyword: string): boolean {
  return greeting.text.split("\n").some((line) => line.trim().toUpperCase().split(/\s+/)[0] === keyword);
}

function authMechanisms(greeting: SmtpReply): string[] {
  for (const line of greeting.text.split("\n")) {
    const parts = line.trim().toUpperCase().split(/[\s=]+/).filter((part) => part.length > 0);
    if (parts[0] === "AUTH") return parts.slice(1);
  }
  return [];
}

/** Rejects a value that cannot go into a header verbatim (CR/LF/NUL = header injection). */
function requireHeaderSafe(value: string, label: string): string {
  if (/[\r\n]/.test(value) || value.includes(String.fromCharCode(0))) {
    throw new Error(`${label} contains illegal characters`);
  }
  return value.trim();
}

/** `Haushaltskasse <no-reply@example.org>` -> `no-reply@example.org`. */
export function addressOf(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled?.[1] ?? value).trim();
}

function clientHostname(from: string): string {
  const domain = addressOf(from).split("@")[1]?.trim();
  return domain && /^[A-Za-z0-9.-]+$/.test(domain) ? domain : "localhost";
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** base64 in 76-character lines, as MIME requires. */
function base64Body(value: string): string {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return (encoded.match(/.{1,76}/g) ?? [""]).join("\r\n");
}

/**
 * RFC 2047 encoded-word for a header value, or the value unchanged when it is
 * plain ASCII. Chunking happens on CODE POINTS, not bytes: splitting a German
 * umlaut between its two UTF-8 bytes would yield an encoded-word that decodes
 * to a replacement character.
 */
export function encodeHeaderValue(value: string): string {
  if (!/[^\x20-\x7e]/.test(value)) return value;
  const chunks: string[] = [];
  let current = "";
  for (const char of value) {
    // 30 source bytes -> 40 base64 characters, which keeps the whole encoded
    // word (charset and delimiters included) inside the 75-character limit.
    if (Buffer.byteLength(current + char, "utf8") > 30) {
      chunks.push(current);
      current = "";
    }
    current += char;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.map((chunk) => `=?UTF-8?B?${base64(chunk)}?=`).join("\r\n ");
}

function encodeAddressHeader(value: string): string {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(value);
  if (!match) return encodeHeaderValue(value);
  const name = match[1] ?? "";
  const address = match[2] ?? "";
  if (name.length === 0) return `<${address}>`;
  return `${encodeHeaderValue(name)} <${address}>`;
}

/**
 * A DATA line consisting of a single "." would end the message early, so
 * every leading "." is doubled (RFC 5321 §4.5.2). The base64 body can never
 * produce one; the headers are why this runs over the whole payload.
 */
export function dotStuff(payload: string): string {
  return payload.replace(/^\./gm, "..");
}

/** RFC 5322 `Date:` — `toUTCString()` ends in "GMT", which is only obsolete syntax. */
function rfc5322Date(now: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${days[now.getUTCDay()]}, ${pad(now.getUTCDate())} ${months[now.getUTCMonth()]} ` +
    `${now.getUTCFullYear()} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} +0000`
  );
}

/** The full RFC 5322 message, CRLF-separated, ready for DATA. Body is base64: 7-bit, no bare ".". */
export function buildMessage(message: MailMessage, from: string, now: Date = new Date(), id: string = randomUUID()): string {
  const subject = encodeHeaderValue(requireHeaderSafe(message.subject, "subject"));
  const domain = addressOf(from).split("@")[1] ?? "localhost";
  return [
    `From: ${encodeAddressHeader(from)}`,
    `To: ${message.to}`,
    `Subject: ${subject}`,
    `Date: ${rfc5322Date(now)}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    // The links in these mails are single-use invite / reset tokens. This
    // header at least asks a mail client not to prefetch them, and it keeps
    // the mails out of auto-responder loops.
    "Auto-Submitted: auto-generated",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(message.text),
    "",
  ].join("\r\n");
}
