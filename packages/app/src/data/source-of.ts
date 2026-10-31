// The rule of the data source (#549), with no import and nothing of the build: `data-source.ts` applies it to the app's
// `import.meta.env`, and `vite.config.ts` and `scripts/bundle-budget.ts` to the build's environment (a mock build carries no
// starknet.js, #927). Node runs it as is (type stripping): the syntax stays erasable.

/**
 * `chain`: every read and write goes to the chain and the indexer (`@paved/chain`'s views and writers). `mock`: every read and
 * write comes from the device's mock ledger (`data/mock/ledger.ts`, #549, #927), and the client runs on the device's data
 * alone, with no request outside its own origin (`data/mock/app.ts`): no chain, economy or indexer client is built, no node or
 * indexer is read, and starknet.js is not in the build. The ledger answers the Vault, the Cobbles ledger and its claims, the
 * packs, the skins, the avatar, the village, the PvP, Story's First Stone, Challenge's pause views, Economy's split and
 * seller, the tokens' balances (USDC, PAVED, vPAVED; a new account holds the faucet's USDC and no PAVED, and the faucet's
 * `mint` is the ledger's), the Challenge's games (their purchase, free spawn, moves, end and settlement, played by
 * game-core's rules with a seeded random in place of the VRF's, `data/mock/challenge.ts`) and every route of the indexer (the
 * leaderboard, the players, their games, the quests and achievements, the referrals and the attacks, from the ledger's games
 * and twenty seeded players, `data/mock/indexer.ts`, `data/mock/players.ts`); a read it does not answer is refused as a
 * deployment without it (`not-configured`), never sent. On `mock`, the wallet is the device's key with the ledger's account,
 * deployed nowhere and read from no node (`wallet/mock-connector.ts`), and an account's village is founded with it at its
 * first connection (`mockConnector`); Found stays for `chain`.
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
