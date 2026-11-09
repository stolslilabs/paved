import type { PageDef } from "../pages";

/** The home's right column's drawers: Missions, Tiles, the Vault. A run of `PAGES` (`routes/pages.ts`), which keeps the table's order. */
export const DRAWER_PAGES: readonly PageDef[] = [
  // Missions (#832): one page, today's limited missions and the lifetime ones; the old `/missions/lifetime` and `/missions/:day`
  // land on it (`router.tsx`). The HUD's drawer at every width, docked at the right from `tablet` (MISSIONS-PAGE).
  { path: "missions", title: "Missions", nav: "quests", panel: true, drawer: true },
  // Tiles (COLLECTION-PAGE, the book's Collection, named after the home's button): the skin each tile wears. The HUD's drawer at every
  // width, docked at the right from `tablet`, under the right column's Tiles; its old Settings sheet `/settings/tiles` lands on it.
  { path: "tiles", title: "Tiles", nav: null, panel: true, drawer: true },
  // The Vault (VAULT-PAGE): the HUD's drawer at every width, docked at the right from `tablet`, beside the home's right column's Vault; its
  // Deposit and Withdraw are the footer's tabs (`?tab=`).
  { path: "vault", title: "Vault", nav: "vault", panel: true, drawer: true },
];
