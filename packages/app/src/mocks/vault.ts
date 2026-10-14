import type { VaultPosition } from "@paved/chain";

const E18 = 10n ** 18n;

/** `Vault.exit_fee()` at V1b's default: 500 bps of the PAVED that leaves, kept for the other holders. */
export const EXIT_FEE_BPS = 500;

/** The Vault's totals: 542,100 PAVED for 500,000 vPAVED (the dead shares' 1,000 included), a rate of about 1.0842. */
const TOTAL_ASSETS = 542_100n * E18;
const TOTAL_SUPPLY = 500_000n * E18;

/** `convert_to_assets` as OpenZeppelin's ERC4626 rounds it at offset 0: `shares x (assets + 1) / (supply + 1)`, down. */
const toAssets = (shares: bigint) => (shares * (TOTAL_ASSETS + 1n)) / (TOTAL_SUPPLY + 1n);
/** `max_withdraw`: the shares' PAVED, the exit fee taken. */
const afterFee = (assets: bigint) => assets - (assets * BigInt(EXIT_FEE_BPS)) / 10_000n;

function position(shares: bigint): VaultPosition {
  const value = toAssets(shares);
  return { shares, value, maxWithdraw: afterFee(value), exitFeeBps: EXIT_FEE_BPS, totalAssets: TOTAL_ASSETS, totalSupply: TOTAL_SUPPLY };
}

/** No vPAVED yet. */
export const VAULT_NONE = position(0n);

/** 1,250.4 vPAVED: worth about 1,355.68 PAVED, 1,287.89 of it withdrawable now. */
export const VAULT_HELD = position(1_250_400_000_000_000_000_000n);

/** `Vault.preview_deposit(100 PAVED)` at this rate. */
export const PREVIEW_DEPOSIT_100 = (100n * E18 * (TOTAL_SUPPLY + 1n)) / (TOTAL_ASSETS + 1n);

/** `Vault.preview_withdraw(500 PAVED)`: the vPAVED it burns, the exit fee included (rounded up by the contract). */
export const PREVIEW_WITHDRAW_500 = (500n * E18 * 10_000n * (TOTAL_SUPPLY + 1n)) / (BigInt(10_000 - EXIT_FEE_BPS) * (TOTAL_ASSETS + 1n)) + 1n;
