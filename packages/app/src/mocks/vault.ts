import type { VaultPosition } from "@paved/chain";
import { PAVED_BALANCE, SPLIT_BPS } from "./economy";

const E18 = 10n ** 18n;

/** `Vault.exit_fee()` at V1b's default: 500 bps of the PAVED that leaves, kept for the other holders. */
export const EXIT_FEE_BPS = 500;

/** The Vault's totals: 542,100 PAVED for 500,000 vPAVED (the dead shares' 1,000 included), a rate of about 1.0842. */
const TOTAL_ASSETS = 542_100n * E18;
const TOTAL_SUPPLY = 500_000n * E18;

const BPS = 10_000n;
const FEE = BigInt(EXIT_FEE_BPS);
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

// The Vault's arithmetic, with the contract's rounding (`contracts/src/systems/vault.cairo`), as `@paved/chain`'s fake
// economy does it (`economy/fake.ts`, `redeemed` and `previewWithdraw`). The chain package exports no pure helper for it
// (only `vaultRate`), and its fake is a class: restated here, citing the lines, so a change of rule is found by grep.

/** `convert_to_assets` as OpenZeppelin's ERC4626 rounds it at offset 0: `shares x (assets + 1) / (supply + 1)`, down. */
const toAssets = (shares: bigint) => (shares * (TOTAL_ASSETS + 1n)) / (TOTAL_SUPPLY + 1n);
/**
 * `max_withdraw` = `_preview_redeem_assets` (`vault.cairo:247-252`, `:294-299`): the shares' value `v` less the redeem
 * fee `ceil(v x f / (f + BPS))` (`calculate_redeem_fee`, `:240`), the fee being inside what leaves.
 */
const afterFee = (value: bigint) => value - ceilDiv(value * FEE, FEE + BPS);

function position(shares: bigint): VaultPosition {
  const value = toAssets(shares);
  return { shares, value, maxWithdraw: afterFee(value), exitFeeBps: EXIT_FEE_BPS, totalAssets: TOTAL_ASSETS, totalSupply: TOTAL_SUPPLY };
}

/** No vPAVED yet. */
export const VAULT_NONE = position(0n);

/** 1,250.4 vPAVED: worth about 1,355.68 PAVED, 1,291.12 of it withdrawable now. */
export const VAULT_HELD = position(1_250_400_000_000_000_000_000n);

/** `Vault.preview_deposit(100 PAVED)` at this rate. */
export const PREVIEW_DEPOSIT_100 = (100n * E18 * (TOTAL_SUPPLY + 1n)) / (TOTAL_ASSETS + 1n);

/**
 * `Vault.preview_withdraw(500 PAVED)`: the shares of `a + ceil(a x f / BPS)` (`calculate_withdraw_fee`, `vault.cairo:233`,
 * the fee on top), converted rounding up as OpenZeppelin's `preview_withdraw` does.
 */
const WITHDRAW = 500n * E18;
export const PREVIEW_WITHDRAW_500 = ceilDiv((WITHDRAW + ceilDiv(WITHDRAW * FEE, BPS)) * (TOTAL_SUPPLY + 1n), TOTAL_ASSETS + 1n);

/** `Vault.preview_deposit(100 PAVED)`'s receipt: the `Deposit` of 100 PAVED for `PREVIEW_DEPOSIT_100` vPAVED. */
const DEPOSITED = { kind: "deposit" as const, assets: 100n * E18, shares: PREVIEW_DEPOSIT_100 };
/** A withdraw of 500 PAVED: its `Withdraw` burns `PREVIEW_WITHDRAW_500` vPAVED. */
const WITHDRAWN = { kind: "withdraw" as const, assets: WITHDRAW, shares: PREVIEW_WITHDRAW_500 };

const base = { deployed: true, position: VAULT_HELD, balance: PAVED_BALANCE, split: SPLIT_BPS, mode: "deposit" as const, amount: "", preview: null };

/**
 * The vault page's states on its data (P10), beside SC2's in `mocks/scenes.ts` (`VAULT`): a guest, the reads on their way,
 * a failed read, a refused write (the writer's typed message), a deposit and a withdraw done, and a delegated position.
 */
export const VAULT_STATES = {
  guest: { ...base, position: null, status: { kind: "guest" as const } },
  loading: { ...base, position: null, status: { kind: "loading" as const } },
  error: { ...base, position: null, status: { kind: "error" as const, message: "RPC error: the node did not answer" } },
  refused: { ...base, amount: "100", preview: PREVIEW_DEPOSIT_100, refused: "The exit fee changed: confirm again" },
  deposited: { ...base, position: { ...VAULT_HELD, shares: VAULT_HELD.shares + DEPOSITED.shares }, done: DEPOSITED },
  withdrawn: { ...base, mode: "withdraw" as const, done: WITHDRAWN },
  delegated: { ...base, delegate: "0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef" },
};
