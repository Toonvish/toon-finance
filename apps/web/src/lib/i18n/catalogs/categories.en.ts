import type { LocaleCatalog } from "@toon/shared";
import type { CategoriesCatalog } from "./categories.de.ts";

/**
 * English category names are taken verbatim from docs/ledger-spec.md §7.1 —
 * they are not invented here.
 */
export const categoriesEn: LocaleCatalog<CategoriesCatalog> = {
  "categories.title": "Categories",
  "categories.description": "Categories organise your expenses. Tags are for anything finer.",
  "categories.manage": "Manage categories",
  "categories.add": "Add category",
  "categories.label": "Label",
  "categories.system": "System",
  "categories.systemHint": "This category belongs to the fixed-cost plan and cannot be changed.",
  "categories.hidden": "Hidden",
  "categories.hide": "Hide",
  "categories.show": "Show",
  "categories.usage": { one: "1 transaction", other: "{count} transactions" },
  "categories.renameHint": "After renaming, this category no longer follows the interface language.",
  "categories.delete.title": "Delete category?",
  "categories.delete.reassign": "Reassign transactions to",
  "categories.delete.inUse": "{count} transactions use this category. Choose a target category.",
  "categories.toast.created": "Category created.",
  "categories.toast.updated": "Category saved.",
  "categories.toast.deleted": "Category deleted.",
  "categories.name.tiere": "Pets",
  "categories.name.miete": "Rent",
  "categories.name.nebenkosten": "Utilities",
  "categories.name.fixkosten": "Fixed costs",
  "categories.name.versicherung": "Insurance",
  "categories.name.steuern_abgaben": "Taxes & fees",
  "categories.name.baumarkt": "DIY & renovation",
  "categories.name.moebel_wohnen": "Furniture & home",
  "categories.name.elektronik": "Electronics",
  "categories.name.lebensmittel": "Groceries",
  "categories.name.haushalt_kueche": "Household & kitchen",
  "categories.name.drogerie": "Drugstore & care",
  "categories.name.kleidung": "Clothing & accessories",
  "categories.name.spiele_medien": "Games & media",
  "categories.name.hobby_kreativ": "Hobby & crafts",
  "categories.name.mobilitaet": "Transport",
  "categories.name.reisen": "Travel",
  "categories.name.freizeit": "Leisure & going out",
  "categories.name.geschenke": "Gifts & donations",
  "categories.name.ausgleich": "Settlement & refunds",
  "categories.name.sonstiges": "Other",
};
