import type { BalanceKind, ShownBalance } from "../components/containers/balances";
import type { PageDef } from "./pages";

/** The balances a page shows, in their order on screen; empty, none (the shell then reads none for it, `balance-pages.ts`). */
export type HeaderBalances = readonly ShownBalance[];

const NONE: HeaderBalances = [];
const COBBLES: HeaderBalances = ["cobbles"];

/**
 * BALANCES-BY-PAGE (#855, the owner's decisions of 2026-10-28, revising #781's "the home's balances on every page"): a page shows
 * only the balances it uses, the currencies its actions spend or earn, and none otherwise; the same set on a phone and from
 * `desktop`. USDC only where USDC is spent: the Cobbles' packs (priced in dollars) and the Challenge's purchase. The Vault shows
 * PAVED and vPAVED (deposited PAVED becomes vPAVED, so it shows even at zero), not the Cobbles. The pages that spend or earn Cobbles
 * (the tile shop, the chests, the missions, the themes, the avatar, a visit) show the Cobbles. None on the League (its header holds
 * the League control, #859), Social (#952), the mode choice, the Story's list, Settings and its pages, the welcome, and the game scenes: the
 * boards, the ends of a game, the PvP attack's flow, its result and a replay (#647). The one place that says it, by route; the
 * balances' own chunk reads it (`Balances`, by the page's route), so the first bundle does not carry it.
 */
export const HEADER_BALANCES: Record<PageDef["path"], HeaderBalances> = {
  welcome: NONE,
  "": ["cobbles", "paved", "vpaved-held"],
  play: NONE,
  "play/challenge": ["usdc"],
  cobbles: ["cobbles", "usdc"],
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
  chat: NONE,
  guild: NONE,
  friends: NONE,
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
 * Where PAVED, vPAVED and the Cobbles lead (#871, the owner's decisions of 2026-10-28): PAVED to the Challenge's purchase, where
 * PAVED is won; vPAVED to the Vault, where PAVED becomes vPAVED; the Cobbles to the packs (#621). USDC mints from the faucet where
 * there is one. The packs open as the village's page from the village, and in place, in a sheet over any other page (BACK-RULE #783).
 */
export const DESTINATION = { paved: "/play/challenge", vpaved: "/vault", cobbles: "/cobbles" } as const;
const LEADING = Object.keys(DESTINATION) as (keyof typeof DESTINATION)[];

/** The balances whose page is the one at `pathname` (vPAVED's Vault, the packs'): in view already, their plates lead nowhere (#855). */
export const hereOf = (pathname: string): readonly BalanceKind[] => LEADING.filter((kind) => DESTINATION[kind] === pathname);

