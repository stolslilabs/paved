import type { PageDef } from "../pages";

/** The home, Play's drawer and its Challenge, the avatar, the shop, the village and the board. A run of `PAGES` (`routes/pages.ts`), which keeps the table's order. */
export const HOME_PAGES: readonly PageDef[] = [
  { path: "", title: "Home", nav: "home" },
  // Play (PLAY-PAGE): the HUD's drawer at every width, docked at the right from `tablet`, as the Shop. Its stake is a view of the same page
  // (one loader, `page-loaders.ts`), its Back up to the modes.
  { path: "play", title: "Play", nav: null, panel: true, drawer: true },
  { path: "play/challenge", title: "Challenge", nav: null, parent: "/play", panel: true, drawer: true },
  // The avatar editor (AVATAR-PAGE, the Paved UX Book's "avatar-editor"), from the Profile's Avatar: the HUD's drawer docked at the left
  // from `tablet`, as the Profile; its Back returns to the Profile (`useBackToProfile`), its cross to the village.
  { path: "avatar", title: "Avatar", nav: null, panel: true, panelSide: "left", drawer: true },
  // The v2 village's daily shop (#739), before `village/:player`: `prefetch` matches in table order. Its chests open where they are
  // won (END-CHEST, the owner's ask of 2026-11-06: the Chests page gone).
  // The Shop (SHOP-PAGE): Tiles, Cobbles and Themes as tabs (`?tab=`), the HUD's drawer docked at the right from `tablet`.
  { path: "village/shop", title: "Shop", nav: "shop", panel: true, drawer: true },
  { path: "village/:player", title: "Village", nav: null },
  { path: "game/:gameId", title: "Board", nav: null },
];
