// STUB ABIs of the economy (P8), written by CLIENT from `docs/architecture/economy.md` until CORE commits the
// real ones. Every entry here is a stub: delete it when its real ABI lands, and let the field-list test
// (`test/economy.test.ts`) say what changed.
//
// - `Economy`: waits for E2 (`contracts/abis/Economy.json`). Shapes from economy.md section 6 ("Effect on CLIENT",
//   "Events"); the integer widths are CLIENT's guesses.
// - `USDC`: waits for the MockUSDC ABI (E3's devnet deploy). The ERC20 subset the client calls.
// - `DailyPaid`: `Daily` with E3's `spawn(stake, referrer, min_out)`; only that call uses it.
import dailyAbi from "../../../../contracts/abis/Daily.json";
import type { Abi, AbiEntry } from "../codec";

/** True for every ABI of this file: the screens say that the economy runs on a stub. */
export const ECONOMY_ABI_IS_STUB = true;

const U8 = "core::integer::u8";
const U32 = "core::integer::u32";
const U64 = "core::integer::u64";
const U128 = "core::integer::u128";
const U256 = "core::integer::u256";
const BOOL = "core::bool";
const ADDRESS = "core::starknet::contract_address::ContractAddress";

const fn = (name: string, inputs: Array<[string, string]>, outputs: string[], view: boolean): AbiEntry => ({
  type: "function",
  name,
  inputs: inputs.map(([n, type]) => ({ name: n, type })),
  outputs: outputs.map((type) => ({ type })),
  state_mutability: view ? "view" : "external",
});

const struct = (name: string, members: Array<[string, string]>): AbiEntry => ({
  type: "struct",
  name,
  members: members.map(([n, type]) => ({ name: n, type })),
});

const event = (name: string, keys: Array<[string, string]>, data: Array<[string, string]>): AbiEntry => ({
  type: "event",
  name: `paved::economy::economy::Economy::${name}`,
  kind: "struct",
  members: [
    ...keys.map(([n, type]) => ({ name: n, type, kind: "key" })),
    ...data.map(([n, type]) => ({ name: n, type, kind: "data" })),
  ],
});

const U256_STRUCT = struct(U256, [["low", U128], ["high", U128]]);

/** STUB of `contracts/abis/Economy.json` (E2). */
export const STUB_ECONOMY_ABI: Abi = [
  U256_STRUCT,
  struct("paved::economy::views::Quote", [
    ["price", U256], // USDC base units: k x entry_price().amount
    ["burn_quote", U256], // q, the USDC swapped and burned
    ["referral", U256], // what a referrer would get (from the margin)
    ["margin", U256], // to the Vault, without a referrer
    ["min_out_hint", U256], // the router's expected PAVED for q, before slippage (read as a quote)
    ["factor", U32], // F, bps
    ["mean", U64], // points x 1,000
    ["threshold", U32], // points: below it the whole stake is lost
    ["slope", U32], // c, bps
    ["cap", U32], // H
  ]),
  struct("paved::economy::views::DayView", [
    ["prior", U64],
    ["sum", U128],
    ["weight", U64],
    ["mean", U64], // points x 1,000; 0 while the day is not closed
    ["closed", BOOL],
  ]),
  struct("paved::economy::views::TermsView", [
    ["stake", U8], // 0 for a game that was not bought
    ["reference", U256], // R, PAVED base units
    ["day", U64],
    ["score", U32],
    ["settled", BOOL],
    ["reward", U256], // PAVED minted at settlement; 0 below the threshold
  ]),
  {
    type: "interface",
    name: "paved::economy::economy::IEconomy",
    items: [
      fn("quote", [["stake", U8]], ["paved::economy::views::Quote"], true),
      fn("day", [["day", U64]], ["paved::economy::views::DayView"], true),
      fn("terms", [["game_id", U32]], ["paved::economy::views::TermsView"], true),
      fn("settle", [["game_ids", `core::array::Span::<${U32}>`]], [], false),
    ],
  },
  event(
    "Purchased",
    [["game_id", U32], ["player_id", "core::felt252"]],
    [
      ["day", U64], ["stake", U8], ["price", U256], ["referrer", ADDRESS], ["referral", U256], ["burned_quote", U256],
      ["burned", U256], ["margin", U256], ["supply", U256], ["factor", U32], ["reference", U256],
    ],
  ),
  event("Recorded", [["game_id", U32]], [["score", U32], ["in_day", BOOL]]),
  event("DayClosed", [["day", U64]], [["mean", U64], ["weight", U64], ["prior", U64], ["ema_after", U64]]),
  event(
    "Settled",
    [["game_id", U32], ["player_id", "core::felt252"]],
    [["day", U64], ["score", U32], ["threshold", U32], ["reward", U256]],
  ),
];

/** STUB of the MockUSDC ABI (E3): the ERC20 entries the client calls. */
export const STUB_USDC_ABI: Abi = [
  U256_STRUCT,
  {
    type: "interface",
    name: "paved::mocks::usdc::IERC20",
    items: [
      fn("approve", [["spender", ADDRESS], ["amount", U256]], [BOOL], false),
      fn("balance_of", [["account", ADDRESS]], [U256], true),
      fn("allowance", [["owner", ADDRESS], ["spender", ADDRESS]], [U256], true),
    ],
  },
];

/** STUB: `Daily` with E3's paid `spawn(stake, referrer, min_out) -> game_id`; every other entry is the real one. */
export const STUB_DAILY_PAID_ABI: Abi = (dailyAbi as Abi).map((entry) =>
  entry.type === "interface"
    ? {
        ...entry,
        items: entry.items?.map((item) =>
          item.name === "spawn" ? fn("spawn", [["stake", U8], ["referrer", ADDRESS], ["min_out", U256]], [U32], false) : item,
        ),
      }
    : entry,
);
