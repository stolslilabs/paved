import { PAGES } from "../routes/pages";

// Where the reads are served from (#549, MOCK-FIRST): the one switch of the mock layer (`data/mock/`). No chain code here: the
// first bundle reads it (the shell's "Mock" mark).

/**
 * `chain`: every read and write goes to the chain and the indexer (`@paved/chain`'s views and writers). `mock`: every read and
 * write comes from the device's mock ledger (`data/mock/ledger.ts`, #549, #927), and the client runs on the device's data
 * alone: the Vault, the Cobbles ledger and its claims, the packs, the skins, the avatar, the village, the PvP, Challenge's pause
 * views, Economy's split and seller, the tokens' balances (USDC, PAVED, vPAVED; a new account holds the faucet's USDC and no
 * PAVED, and the faucet's `mint` is the ledger's), the Challenge's games (their purchase, free spawn, moves, end and
 * settlement, played by game-core's rules with a seeded random in place of the VRF's, `data/mock/challenge.ts`) and every
 * route of the indexer (the leaderboard, the players, their games, the quests and achievements, the referrals and the
 * attacks, from the ledger's games and twenty seeded players, `data/mock/indexer.ts`, `data/mock/players.ts`). On `mock`, the
 * wallet is the device's key with the ledger's account, deployed nowhere and read from no node (`wallet/mock-key.ts`), and an
 * account's village is founded with it at its first connection (`mockConnector`); Found stays for `chain`.
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

/** The mock serves this build's data: the pages show the "Mock" mark. */
export const MOCKED = DATA_SOURCE === "mock";

/**
 * The pages that read mocked data when the source is `mock` (their header shows the mark): every page of the route map since
 * #927, the leaderboard's, the players' and the game-over pages' indexer included. The mark's text says so (`MOCK_MARK_TEXT`).
 */
export const MOCKED_PAGES: ReadonlySet<string> = new Set(PAGES.map((page) => page.path));
