import type { NamespaceCatalog } from "@toon/shared";

/**
 * `settings.language.de` / `.en` are AUTONYMS and byte-identical in both
 * catalogs (docs/spec.md §6.9) — checked by `lib/i18n/i18n.test.ts`.
 */
export const settingsDe = {
  "settings.title": "Profil",
  "settings.profile.title": "Dein Konto",
  "settings.profile.name": "Name",
  "settings.profile.email": "E-Mail",
  "settings.profile.saved": "Gespeichert.",
  "settings.password.title": "Passwort ändern",
  "settings.password.current": "Aktuelles Passwort",
  "settings.password.new": "Neues Passwort",
  "settings.password.submit": "Passwort ändern",
  "settings.password.changed": "Passwort geändert.",
  "settings.household.title": "Haushalt",
  "settings.household.defaultName": "Unser Haushalt",
  "settings.household.name": "Name des Haushalts",
  "settings.household.manage": "Haushalt verwalten",
  "settings.household.none": "Du gehörst noch zu keinem Haushalt.",
  "settings.household.create": "Haushalt anlegen",
  "settings.household.members": "Mitglieder",
  "settings.household.you": "du",
  "settings.household.joinedAt": "dabei seit {date}",
  "settings.household.displayName": "Anzeigename",
  "settings.household.invite": "Zweite Person einladen",
  "settings.household.inviteCreate": "Einladung erstellen",
  "settings.household.inviteEmail": "E-Mail-Adresse (optional)",
  "settings.household.inviteLink": "Einladungslink",
  "settings.household.inviteLinkHint": "Der Link gilt 14 Tage. Wer ihn hat, kann beitreten.",
  "settings.household.inviteRevoke": "Einladung zurückziehen",
  "settings.household.mailSent": "Einladung per E-Mail verschickt.",
  "settings.household.mailNotConfigured":
    "Es ist kein Mailversand eingerichtet — gib den Link von Hand weiter.",
  "settings.household.mailFailed":
    "Der Versand ist fehlgeschlagen. Der Link gilt trotzdem — gib ihn von Hand weiter.",
  "settings.household.full": "Dieser Haushalt ist vollständig. Mehr als zwei Personen sind nicht vorgesehen.",
  "settings.household.leave": "Haushalt verlassen",
  "settings.household.leaveConfirm": "Wirklich verlassen? Du siehst danach keine Buchungen mehr.",
  "settings.language.title": "Sprache",
  "settings.language.system": "Systemsprache",
  "settings.language.de": "Deutsch",
  "settings.language.en": "English",
  "settings.theme.title": "Darstellung",
  "settings.theme.system": "System",
  "settings.theme.light": "Hell",
  "settings.theme.dark": "Dunkel",
  "settings.sessions.title": "Angemeldete Geräte",
  "settings.sessions.current": "Dieses Gerät",
  "settings.sessions.lastUsed": "zuletzt aktiv {date}",
  "settings.sessions.revoke": "Abmelden",
  "settings.about.title": "Über",
  "settings.about.version": "Version {version}",
} as const satisfies NamespaceCatalog<"settings">;

export type SettingsCatalog = typeof settingsDe;
