import type { SplitView } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Separator } from "../ui/separator";
import { Amount } from "../elements/amount";
import { shortAddress } from "../elements/player-name";
import { StatRow } from "../elements/stat-row";

export interface PriceBreakdownProps {
  stake: number;
  /** USDC base units (`QuoteView.price`). */
  price: bigint;
  /** The burn's boost at this stake, bps (`10_000 + 100 x stake`). */
  boostBps: number;
  /** `Economy.split_bps()`: burn + vault = 10,000; the referral is paid out of the Vault's part. */
  split: SplitView;
  /** The referrer from `?ref=`, or null. */
  referrer: string | null;
  className?: string;
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const share = (price: bigint, bps: number) => (price * BigInt(bps)) / 10_000n;

/**
 * The price of a stake, its boost, and where the USDC goes (`split_bps`, V1b): the burn's part, the Vault's part, and
 * with a referrer, the referral paid out of the Vault's part. Without one the Vault keeps it.
 */
export function PriceBreakdown({ stake, price, boostBps, split, referrer, className }: PriceBreakdownProps) {
  const referral = referrer ? share(price, split.referral) : 0n;
  const vault = price - share(price, split.burn) - referral;
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-end justify-between gap-3 pb-2">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">Price for stake {stake}</span>
          <Amount value={price} token="usdc" className="text-3xl text-foreground" />
        </span>
        <span className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground">Burn boost</span>
          <span className="font-mono text-lg font-semibold text-success tabular-nums">+{pct(boostBps - 10_000)}</span>
        </span>
      </div>
      <Separator />
      <StatRow icon="arrow-trend-up" label="Burned" hint="Buys $TILE and burns it, boosted" value={<Amount value={share(price, split.burn)} token="usdc" />} />
      <StatRow icon="vault" label="Vault" hint="Paid to the vPAVED holders" value={<Amount value={vault} token="usdc" />} />
      <StatRow
        icon="user-group"
        label="Referral"
        hint={referrer ? `To ${shortAddress(referrer)}, from the Vault's part` : "No referrer: the Vault keeps it"}
        value={<Amount value={referral} token="usdc" />}
      />
      <div className="flex justify-between pt-1 text-[11px] text-muted-foreground">
        <span>Split</span>
        <span className="font-mono tabular-nums">
          burn {pct(split.burn)} · Vault {pct(split.vault)}, referral {pct(split.referral)} of it
        </span>
      </div>
    </div>
  );
}
