// Where the reads the deployed classes lack are served from (#549, MOCK-FIRST): the one switch of the mock layer
// (`data/mock/`). No chain code here: the first bundle reads it (the shell's "Mock" mark).

/**
 * `chain`: every read and write goes to the chain and the indexer (`@paved/chain`'s views and writers). `mock`: the reads
 * and writes the network's classes do not have yet (the Vault, the Cobbles ledger and its claims, the packs, the skins, the avatar, the village, the PvP,
 * Challenge's pause views, Economy's split and seller, the indexer's Cobbles and referrals), the tokens' balances (USDC,
 * PAVED, vPAVED; a new account holds the faucet's USDC and no PAVED, and the faucet's `mint` is the ledger's, #927) and the
 * Challenge's games (their purchase, free spawn, moves, end and settlement, played by game-core's rules with a seeded random
 * in place of the VRF's, #927) come from the device's mock ledger (`data/mock/ledger.ts`, `data/mock/challenge.ts`); the
 * indexer's other pages stay the indexer's. On `mock`, the wallet is the device's key with the ledger's account, deployed
 * nowhere and read from no node (`wallet/mock-key.ts`, #927), and an account's village is founded with it at its first
 * connection (`mockConnector`); Found stays for `chain`.
 */
export type DataSourceName = "chain" | "mock";

/**
 * The networks whose deployed classes are behind the client (#549): the mock is their default. Sepolia's Vault, Setup,
 * Challenge and Economy classes predate the views the pages read; its indexer predates the Cobbles and the referrals.
 */
export const MOCK_BY_DEFAULT: readonly string[] = ["sepolia"];

/**
 * The source of a build: `VITE_DATA_SOURCE` when it is `mock` or `chain`, else the network's default (`mock` on the networks
 * of `MOCK_BY_DEFAULT`, `chain` elsewhere). Any other value is the default, never a third source.
 */
export function dataSourceOf(env: { source?: string; network?: string }): DataSourceName {
  const asked = env.source?.trim().toLowerCase();
  if (asked === "mock" || asked === "chain") return asked;
  return env.network && MOCK_BY_DEFAULT.includes(env.network) ? "mock" : "chain";
}

/** This build's source: `VITE_DATA_SOURCE`, else the default of `VITE_NETWORK` (the dev server without one is devnet: `chain`). */
export const DATA_SOURCE: DataSourceName = dataSourceOf({
  source: import.meta.env.VITE_DATA_SOURCE,
  network: import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : ""),
});

/** The mock serves part of this build's data: the pages show the "Mock" mark. */
export const MOCKED = DATA_SOURCE === "mock";

/**
 * The pages that read mocked data when the source is `mock` (their header shows the mark): Home and Play (the free games'
 * credits, the pause and the game in play), the Challenge's purchase (its quote, the split, the pause), its board and its
 * game-over page (the game, its terms, its day and the settlement, #927), the Cobble packs (the packs, the Cobbles), the
 * missions (their Cobbles and claims), the Vault, the referral (its earnings and split), the theme (the skins), the avatar
 * creator (its catalogue, items and look, #626), the village (its territory, rewards and tiers, #646) and the PvP flow (the
 * matchmaker, the attacks, the leagues and the defence log, #647). The leaderboard, the player pages, Training, the tutorial
 * and Settings read only the chain and the indexer.
 */
export const MOCKED_PAGES: ReadonlySet<string> = new Set(["", "play", "play/challenge", "game/:gameId", "game/:gameId/over", "cobbles", "missions", "vault", "referral", "settings/theme", "settings/theme/:theme", "settings/tiles", "avatar", "village/:player", "village/chests", "village/shop", "pvp", "pvp/result/:id", "pvp/replay/:attacker/:id", "pvp/league"]);
