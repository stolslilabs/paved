import type { VaultPosition as Position } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Amount, formatUnits } from "../elements/amount";
import { shortAddress } from "../elements/short-address";
import { StatRow } from "../elements/stat-row";
import { formatBps } from "./split-bar";

const E18 = 10n ** 18n;

/**
 * The Vault's rate, PAVED per vPAVED x 1e18, rounded down: OpenZeppelin's conversion at offset 0,
 * `(total_assets + 1) / (total_supply + 1)`. `@paved/chain`'s `vaultRate`, restated so the scenes import only its types.
 */
export function vaultRate(totalAssets: bigint, totalSupply: bigint): bigint {
  return ((totalAssets + 1n) * E18) / (totalSupply + 1n);
}

/**
 * The holder's part of every vPAVED (`shares / total_supply`, the dead shares counted in the supply), in basis points
 * rounded down: what `formatBps` writes. 0 when there is no supply.
 */
export function shareBps(shares: bigint, totalSupply: bigint): number {
  return totalSupply === 0n ? 0 : Number((shares * 10_000n) / totalSupply);
}

export interface VaultPositionProps {
  position: Position;
  /**
   * `Vault.delegates(holder)`: the address the vPAVED votes for, null when delegated to nobody (vPAVED counts as votes only
   * once delegated). Left out, the row is not shown. Read only: the client sends no `delegate`.
   */
  delegate?: string | null;
  className?: string;
}

/**
 * A holder's vPAVED (V1b, P-56): the shares, their PAVED at the rate, what leaves now once the exit fee is taken
 * (`max_withdraw`), the rate and the fee. No claim: the rate is the reward, raised by every purchase's margin and exit fee.
 */
export function VaultPosition({ position, delegate, className }: VaultPositionProps) {
  const rate = vaultRate(position.totalAssets, position.totalSupply);
  const share = shareBps(position.shares, position.totalSupply);
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <span className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Your share</span>
          <Amount value={position.shares} token="vpaved" className="text-2xl text-foreground mobile:text-3xl" />
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">Worth</span>
          <Amount value={position.value} token="paved" className="text-xl text-primary" />
        </span>
      </div>
      <StatRow
        icon="arrow-right-from-bracket"
        label="Withdrawable now"
        hint="max_withdraw: the exit fee taken"
        value={<Amount value={position.maxWithdraw} token="paved" />}
      />
      <StatRow
        icon="chart-pie"
        label="Your share of the Vault"
        hint="Of every vPAVED, the dead shares included"
        value={share === 0 && position.shares > 0n ? "< 0.01%" : formatBps(share)}
      />
      <StatRow icon="arrow-trend-up" label="Rate" hint="PAVED per vPAVED, rises with every purchase" value={`1 : ${formatUnits(rate, 18, 4)}`} tone="success" />
      <StatRow icon="percent" label="Exit fee" hint="Kept in the Vault for the other holders" value={formatBps(position.exitFeeBps)} />
      <StatRow icon="piggy-bank" label="In the Vault" hint="All holders" value={<Amount value={position.totalAssets} token="paved" />} tone="muted" />
      {delegate !== undefined && (
        <StatRow
          icon="check-to-slot"
          label="Votes"
          hint={delegate === null ? "vPAVED votes once delegated; delegation is not in the app yet" : "Your vPAVED votes through this address"}
          value={delegate === null ? "Not delegated" : <span title={delegate}>{shortAddress(delegate)}</span>}
          tone={delegate === null ? "muted" : "default"}
        />
      )}
    </div>
  );
}
