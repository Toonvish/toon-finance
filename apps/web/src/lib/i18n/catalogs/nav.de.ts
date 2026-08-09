import type { NamespaceCatalog } from "@toon/shared";

export const navDe = {
  "nav.overview": "Übersicht",
  "nav.transactions": "Buchungen",
  "nav.create": "Erfassen",
  "nav.profile": "Profil",
  "nav.plan": "Fixkosten",
  "nav.categories": "Kategorien",
  "nav.household": "Haushalt",
} as const satisfies NamespaceCatalog<"nav">;

export type NavCatalog = typeof navDe;
