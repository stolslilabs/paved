import type { PageDef } from "../pages";

/** The referral and Settings with its views. A run of `PAGES` (`routes/pages.ts`), which keeps the table's order. */
export const SETTINGS_PAGES: readonly PageDef[] = [
  // Referral (P10): the player's link, reached from the profile's Invite (the Paved UX Book's), no longer a sheet over Settings
  // (SETTINGS-PAGE): a page of its own, in the right panel from `desktop`, Back to the village.
  { path: "referral", title: "Referral", nav: "settings", panel: true },
  // Settings (SETTINGS-PAGE): the HUD's drawer at every width, docked at the right from `tablet` (the dock's right-most button). Its
  // Themes and Credits are views in it, each its own URL, one component (`page-loaders.ts`), so a move between them keeps the drawer.
  // A theme's tiles are the Shop's (SHOP-PAGE).
  { path: "settings/theme", title: "Themes", nav: "settings", panel: true, drawer: true },
  { path: "settings/credits", title: "Credits", nav: "settings", panel: true, drawer: true },
  { path: "settings", title: "Settings", nav: "settings", panel: true, drawer: true },
];
