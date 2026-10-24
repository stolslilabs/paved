import type { HeaderBalances } from "../components/containers/balances-context";
import type { PageDef } from "./pages";

/** On a phone, the Cobbles; from `desktop`, every balance (#720): the pages where Cobbles are bought, earned or spent. */
const COBBLES: HeaderBalances = { phone: true, desktop: "all" };
/** None on a phone, every balance from `desktop`. */
const DESKTOP: HeaderBalances = { phone: false, desktop: "all" };
/** None at any width: the game scenes. */
const NONE: HeaderBalances = { phone: false, desktop: "none" };
/** A scene that draws the Cobbles itself, at every width: the header adds the other balances from `desktop`, never the Cobbles. */
const OWN_COBBLES: HeaderBalances = { phone: false, desktop: "no-cobbles" };

/**
 * HEADER-BALANCES (#720, the owner's table): which balances a page's header shows, by route and width, the one place that says
 * it. On a phone no currency but the Cobbles, and those only where they move: Home, and the pages where Cobbles are bought,
 * earned or spent. From `desktop` every balance outside the game scenes. The game scenes (the boards, the ends of a game) show
 * none. The Cobbles never show twice: a scene with its own Cobbles plate (the village) gets none from its header.
 * Not routed yet, so absent here, the PvP scenes take the same rule in their own bars: the attack none; the scout and the
 * result their own Cobbles in place at both widths and none in their bars (the result's `TopBar` passes `balances={false}`);
 * the league and the defence log `DESKTOP` once routed.
 */
export const HEADER_BALANCES: Record<PageDef["path"], HeaderBalances> = {
  welcome: DESKTOP,
  "": COBBLES,
  play: DESKTOP,
  "play/challenge": DESKTOP,
  cobbles: COBBLES,
  avatar: COBBLES,
  village: OWN_COBBLES,
  "village/:player": OWN_COBBLES,
  "game/:gameId": NONE,
  training: NONE,
  story: DESKTOP,
  "story/:campaign/:level": NONE,
  "game/:gameId/over": NONE,
  "training/over": NONE,
  "missions/lifetime": COBBLES,
  "missions/:day?": COBBLES,
  vault: DESKTOP,
  referral: DESKTOP,
  "settings/theme": COBBLES,
  "settings/theme/:theme": COBBLES,
  "settings/tiles": DESKTOP,
  "settings/credits": DESKTOP,
  settings: DESKTOP,
};

/** A page's rule; "not found" (no page) shows every balance from `desktop`, none on a phone. */
export const headerBalancesOf = (page: PageDef | null): HeaderBalances => (page ? (HEADER_BALANCES[page.path] ?? DESKTOP) : DESKTOP);

/** A page that shows no balance at all: the shell reads none for it. */
export const showsNoBalance = (rule: HeaderBalances) => !rule.phone && rule.desktop === "none";
