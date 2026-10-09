// STUB ABIs of what E3 has not merged (P8). `Economy` is no longer here: it is the real `contracts/abis/Economy.json`
// (E2, #262). Every entry left is a stub: delete it when its real ABI lands, and let `test/economy.test.ts` say so.
//
// - `USDC`: waits for the MockUSDC ABI (E3's devnet deploy). The ERC20 subset the client calls.
// - `DailyPaid`: `Daily` with E3's `spawn(stake, referrer, min_out)`; only that call uses it.
import dailyAbi from "../../../../contracts/abis/Daily.json";
import type { Abi, AbiEntry } from "../codec";

/** True while the paid spawn and USDC are stubs (E3): the screens say that purchases are not live yet. */
export const ECONOMY_ABI_IS_STUB = true;

const U8 = "core::integer::u8";
const U32 = "core::integer::u32";
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

const U256_STRUCT = struct(U256, [["low", U128], ["high", U128]]);

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
