import { BPS } from "./amounts";
import type { VaultPosition } from "./views";

// The Vault's reads (P10): an OpenZeppelin ERC4626 over PAVED, vPAVED (`contracts/src/systems/vault.cairo`, P-56,
// `docs/architecture/vault-share.md` and its addendum). The vault page reads only this interface, so another share
// token (or a later class of the Vault) swaps in behind it. `EconomyViews` extends it: `RpcEconomyViews` and
// `FakeEconomy` implement both.

export interface VaultViews {
  /**
   * The holder's position: `balance_of`, `convert_to_assets` of it, `max_withdraw`, `exit_fee`, `total_assets` and
   * `total_supply`. The rate is `vaultRate(totalAssets, totalSupply)`.
   */
  vault(account: string): Promise<VaultPosition>;
  /** `Vault.max_redeem(owner)`: the most vPAVED a `redeem` burns now (the Vault sets no redeem limit: the balance). */
  maxRedeem(account: string): Promise<bigint>;
  /** `Vault.preview_deposit(assets)`: the vPAVED a deposit of `assets` PAVED mints now (0 is refused by the contract). */
  previewDeposit(assets: bigint): Promise<bigint>;
  /** `Vault.preview_withdraw(assets)`: the vPAVED a withdraw of `assets` PAVED burns now, the exit fee included. */
  previewWithdraw(assets: bigint): Promise<bigint>;
  /** `Vault.preview_redeem(shares)`: the PAVED a redeem of `shares` pays now, the exit fee taken. */
  previewRedeem(shares: bigint): Promise<bigint>;
  /**
   * `Vault.delegates(account)` (OpenZeppelin's `VotesComponent`), as 0x-hex; null when the holder delegated to nobody.
   * vPAVED counts as votes only once delegated. Read only: the client sends no `delegate`.
   */
  delegateOf(account: string): Promise<string | null>;
  /** `PavedToken.balance_of(account)`: the PAVED a deposit can take. */
  pavedBalance(account: string): Promise<bigint>;
}

/**
 * The exit fee of a `withdraw` of `assets` PAVED, on top of it: `ceil(assets x fee / 10,000)`, as the Vault's
 * `calculate_withdraw_fee` (`vault.cairo`, `Rounding::Ceil`). The vPAVED of `assets + fee` burn.
 */
export function withdrawFee(assets: bigint, exitFeeBps: number): bigint {
  const fee = BigInt(exitFeeBps);
  return ceilDiv(assets * fee, BPS);
}

/**
 * The exit fee inside a `redeem` worth `value` PAVED at the rate: `ceil(value x fee / (fee + 10,000))`, as the Vault's
 * `calculate_redeem_fee`; the holder receives `value` less it (`preview_redeem`, `max_withdraw`).
 */
export function redeemFee(value: bigint, exitFeeBps: number): bigint {
  const fee = BigInt(exitFeeBps);
  return ceilDiv(value * fee, fee + BPS);
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}
