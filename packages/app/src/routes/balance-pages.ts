/**
 * The pages that show balances (#855), all the first screen needs of the rule: the shell reads the balances for them (and for a
 * panel's page, the home mounted under it), and none for the others. Which balances each shows is the rule's
 * (`header-balances.ts`), read in the balances' own chunk; header-balances.test checks that both name the same pages.
 */
export const BALANCE_PAGES: ReadonlySet<string> = new Set([
  "",
  "play/challenge",
  // The Puzzle's view: the Cobbles its first place wins.
  "play/puzzle",
  // The Joust's view: the Cobbles its jousters win.
  "play/joust",
  // The Expedition's view: the Cobbles its tiers pay.
  "play/expedition",
  // The Masterpiece's view: the Cobbles its tiers pay.
  "play/masterpiece",
  // The Colossus's view: the Cobbles its tiers and its top 10 pay.
  "play/colossus",
  // The Conquest's page: the Cobbles its gifts, its phases and its final rank pay.
  "play/conquest",
  // The Tournament's view: the Cobbles of the round reached.
  "play/tournament",
  "avatar",
  "village/:player",
  "village/shop",
  "missions",
  "tiles",
  "vault",
  "settings/theme",
]);
