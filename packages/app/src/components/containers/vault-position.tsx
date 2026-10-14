import type { VaultPosition as Position } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Amount, formatUnits } from "../elements/amount";
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

export interface VaultPositionProps {
  position: Position;
  className?: string;
}

/**
 * A holder's vPAVED (V1b, P-56): the shares, their $TILE at the rate, what leaves now once the exit fee is taken
 * (`max_withdraw`), the rate and the fee. No claim: the rate is the reward, raised by every purchase's margin and exit fee.
 */
export function VaultPosition({ position, className }: VaultPositionProps) {
  const rate = vaultRate(position.totalAssets, position.totalSupply);
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <span className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Your share</span>
          <Amount value={position.shares} token="vpaved" className="text-3xl text-foreground" />
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
      <StatRow icon="arrow-trend-up" label="Rate" hint="$TILE per vPAVED, rises with every purchase" value={`1 : ${formatUnits(rate, 18, 4)}`} tone="success" />
      <StatRow icon="percent" label="Exit fee" hint="Kept in the Vault for the other holders" value={formatBps(position.exitFeeBps)} />
      <StatRow icon="vault" label="In the Vault" hint="All holders" value={<Amount value={position.totalAssets} token="paved" />} tone="muted" />
    </div>
  );
}
