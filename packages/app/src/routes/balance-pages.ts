/**
 * The pages that show balances (#855), all the first screen needs of the rule: the shell reads the balances for them (and for a
 * panel's page, the home mounted under it), and none for the others. Which balances each shows is the rule's
 * (`header-balances.ts`), read in the balances' own chunk; header-balances.test checks that both name the same pages.
 */
export const BALANCE_PAGES: ReadonlySet<string> = new Set([
  "",
  "play/challenge",
  "cobbles",
  "avatar",
  "village/:player",
  "village/chests",
  "village/shop",
  "missions",
  "vault",
  "settings/theme",
  "settings/theme/:theme",
]);
