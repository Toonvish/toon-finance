/**
 * Every message this app can send, as pure functions: input -> `MailMessage`.
 * No I/O and no URL building here — the caller passes the finished link,
 * because only the caller knows whether it points at the web app
 * (`WEB_ORIGIN`) or at something an operator printed on a terminal.
 *
 * Copy is resolved through the server catalog for the recipient's `locale`
 * (docs/spec.md §6.10) — plain text only, no HTML alternative: the catalog
 * carries exactly one sentence per mail, so a rich HTML skeleton would have
 * nothing of substance to add.
 */
import { type Locale, SERVER_CATALOGS, createTranslator, type Translator } from "@toon/shared";
import type { MailMessage } from "./index.ts";

/** Both locale catalogs share the same key/placeholder shape; pick one as the type. */
type ServerTranslator = Translator<typeof SERVER_CATALOGS.de>;

function translatorFor(locale: Locale): ServerTranslator {
  return createTranslator(SERVER_CATALOGS[locale], locale) as ServerTranslator;
}

export interface InviteMailInput {
  to: string;
  /** Household name, for `{household}`. */
  household: string;
  /** Inviting member's display name, for `{name}`. */
  name: string;
  /** The finished `inviteUrl`. */
  url: string;
  locale: Locale;
}

export function inviteMail(input: InviteMailInput): MailMessage {
  const t = translatorFor(input.locale);
  return {
    to: input.to,
    subject: t("server.mail.inviteSubject", { household: input.household }),
    text: t("server.mail.inviteBody", { name: input.name, household: input.household, url: input.url }),
  };
}

export interface PasswordResetMailInput {
  to: string;
  /** The finished reset link. */
  url: string;
  locale: Locale;
}

export function passwordResetMail(input: PasswordResetMailInput): MailMessage {
  const t = translatorFor(input.locale);
  return {
    to: input.to,
    subject: t("server.mail.resetSubject"),
    text: t("server.mail.resetBody", { url: input.url }),
  };
}
