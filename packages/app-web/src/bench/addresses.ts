/**
 * The chain the in-play bench runs on: the four contract addresses and the playing account, as the
 * env of the app reads them (src/utils/network.ts). The one source of both sides: the page
 * (play.tsx) and the driver's mock of the RPC (scripts/bench/mock-chain.ts) import it. Plain
 * values, no dependency: safe to load from the browser bundle and from the driver.
 */
export const BENCH_ADDRESSES = {
  VITE_ACCOUNT_ADDRESS: "0x1a",
  VITE_DAILY_ADDRESS: "0x2a",
  VITE_TUTORIAL_ADDRESS: "0x3a",
  VITE_TOKEN_ADDRESS: "0x4a",
  VITE_PLAYER_ADDRESS: "0x5a",
  VITE_PLAYER_PRIVATE_KEY: "0x1",
};
