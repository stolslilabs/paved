import type { BalanceKind, ShownBalance } from "../components/containers/balances";
import { HOME_BALANCES, PACKS_BALANCES } from "../components/containers/balances-context";
import type { PageDef } from "./pages";

export { HOME_BALANCES };

/** The balances a page shows, in their order on screen; empty, none (the shell then reads none for it). */
export type HeaderBalances = readonly ShownBalance[];

const NONE: HeaderBalances = [];
const COBBLES: HeaderBalances = ["cobbles"];

/**
 * BALANCES-BY-PAGE (#855, the owner's decisions of 2026-10-28, revising #781's "the home's balances on every page"): a page shows
 * only the balances it uses, the currencies its actions spend or earn, and none otherwise; the same set on a phone and from
 * `desktop`. USDC only where USDC is spent: the Cobbles' packs (priced in dollars) and the Challenge's purchase. The Vault shows
 * PAVED and vPAVED (deposited PAVED becomes vPAVED, so it shows even at zero), not the Cobbles. The pages that spend or earn Cobbles
 * (the tile shop, the chests, the missions, the themes, the avatar, a visit) show the Cobbles. None on the League (its header holds
 * the League control, #859), the mode choice, the Story's list, Settings and its pages, the welcome, and the game scenes: the
 * boards, the ends of a game, the PvP attack's flow, its result and a replay (#647). The one place that says it, by route.
 */
export const HEADER_BALANCES: Record<PageDef["path"], HeaderBalances> = {
  welcome: NONE,
  "": HOME_BALANCES,
  play: NONE,
  "play/challenge": ["usdc"],
  cobbles: PACKS_BALANCES,
  avatar: COBBLES,
  "village/:player": COBBLES,
  "village/chests": COBBLES,
  "village/shop": COBBLES,
  "game/:gameId": NONE,
  training: NONE,
  story: NONE,
  "story/:campaign/:level": NONE,
  "game/:gameId/over": NONE,
  "training/over": NONE,
  missions: COBBLES,
  vault: ["paved", "vpaved"],
  referral: NONE,
  "settings/theme": COBBLES,
  "settings/theme/:theme": COBBLES,
  "settings/tiles": NONE,
  "settings/credits": NONE,
  settings: NONE,
  pvp: NONE,
  "pvp/result/:id": NONE,
  "pvp/replay/:attacker/:id": NONE,
  "pvp/match/:id": NONE,
  "pvp/league": NONE,
};

/**
 * Where PAVED, vPAVED and the Cobbles lead: the Vault, and the Cobble packs (#621). USDC mints from the faucet where there is one.
 * The packs open as the village's page from the village, and in place, in a sheet over any other page (BACK-RULE #783).
 */
export const DESTINATION = { paved: "/vault", vpaved: "/vault", cobbles: "/cobbles" } as const;
const LEADING = Object.keys(DESTINATION) as (keyof typeof DESTINATION)[];

/** The balances whose page is the one at `pathname` (the Vault's, the packs'): in view already, their plates lead nowhere (#855). */
export const hereOf = (pathname: string): readonly BalanceKind[] => LEADING.filter((kind) => DESTINATION[kind] === pathname);

/** A page's balances; "not found" (no page) shows none. */
export const balancesOf = (page: PageDef | null): HeaderBalances => (page === null ? NONE : HEADER_BALANCES[page.path]);
