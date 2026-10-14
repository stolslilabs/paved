/**
 * The chain the in-play bench runs on: the contract addresses and the playing account, as the
 * env of the app reads them (src/utils/network.ts). The one source of both sides: the page
 * (play.tsx) and the driver's mock of the RPC (scripts/bench/mock-chain.ts) import it. Plain
 * values, no dependency: safe to load from the browser bundle and from the driver.
 */
/**
 * The entry token (the Faucet, the test USDC) the mock RPC names in `Challenge.entry_price` and answers `balance_of` for. It is
 * not an env variable of the app (the faucet is `contracts.Faucet` of the file only): the page reads the token from `entry_price`.
 */
export const BENCH_FAUCET = "0x4a";

export const BENCH_ADDRESSES = {
  VITE_CHALLENGE_ADDRESS: "0x2a",
  VITE_PLAYER_ADDRESS: "0x5a",
  VITE_PLAYER_PRIVATE_KEY: "0x1",
};
