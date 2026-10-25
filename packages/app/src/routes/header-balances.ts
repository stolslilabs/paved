import type { HeaderBalances } from "../components/containers/balances-context";
import type { PageDef } from "./pages";

/** On a phone, the Cobbles; from `desktop`, every balance (#720): the pages where Cobbles are bought, earned or spent. */
const COBBLES: HeaderBalances = { phone: true, desktop: "all" };
/** None on a phone, every balance from `desktop`. */
const DESKTOP: HeaderBalances = { phone: false, desktop: "all" };
/** None at any width: the game scenes. */
const NONE: HeaderBalances = { phone: false, desktop: "none" };

/**
 * HEADER-BALANCES (#720, the owner's table): which balances a page's header shows, by route and width, the one place that says
 * it. On a phone no currency but the Cobbles, and those only where they move: Home, and the pages where Cobbles are bought,
 * earned or spent. From `desktop` every balance outside the game scenes. The game scenes (the boards, the ends of a game) show
 * none. The Cobbles never show twice: a scene that draws its own Cobbles plate (the player's own village) tells its bar
 * (`TopBar` `ownCobbles`), which then leaves them out at every width; a visit to another's village keeps the header's.
 * The PvP scenes (#647) take the same rule: the attack's flow (`pvp`: the search, the scout, the attack) and a replay none,
 * as the game scenes; the result none in its bar (its `TopBar` passes `balances={false}`), the scout and the result drawing
 * their own Cobbles in place; the league and the defence log `DESKTOP`.
 */
export const HEADER_BALANCES: Record<PageDef["path"], HeaderBalances> = {
  welcome: DESKTOP,
  "": COBBLES,
  play: DESKTOP,
  "play/challenge": DESKTOP,
  cobbles: COBBLES,
  avatar: COBBLES,
  "village/:player": COBBLES,
  "village/chests": COBBLES,
  "village/shop": COBBLES,
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
  pvp: NONE,
  "pvp/result/:id": NONE,
  "pvp/replay/:attacker/:id": NONE,
  "pvp/defence": DESKTOP,
  "pvp/league": DESKTOP,
};

/** A page's rule; "not found" (no page) shows every balance from `desktop`, none on a phone. */
export const headerBalancesOf = (page: PageDef | null): HeaderBalances => (page ? (HEADER_BALANCES[page.path] ?? DESKTOP) : DESKTOP);

/** A page that shows no balance at all: the shell reads none for it. */
export const showsNoBalance = (rule: HeaderBalances) => !rule.phone && rule.desktop === "none";
