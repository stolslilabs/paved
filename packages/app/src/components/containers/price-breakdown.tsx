import { cn } from "../../lib/utils";
import { Separator } from "../ui/separator";
import { Amount } from "../elements/amount";
import { shortAddress } from "../elements/player-name";
import { StatRow } from "../elements/stat-row";

/** How the price is shared, bps (the chain's `split_bps`; `mocks/economy.ts` stands for it until then). */
export interface PriceSplit {
  burn: number;
  vault: number;
  referral: number;
}

export interface PriceBreakdownProps {
  stake: number;
  /** USDC base units (`QuoteView.price`). */
  price: bigint;
  /** The burn's boost at this stake, bps (`10_000 + 100 x stake`). */
  boostBps: number;
  split: PriceSplit;
  /** The referrer from `?ref=`, or null. */
  referrer: string | null;
  className?: string;
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const share = (price: bigint, bps: number) => (price * BigInt(bps)) / 10_000n;

/** The price of a stake, its boost, and where the USDC goes: burn, vault, referral. */
export function PriceBreakdown({ stake, price, boostBps, split, referrer, className }: PriceBreakdownProps) {
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
      <StatRow icon="vault" label="Vault" hint="Paid to the stakers" value={<Amount value={share(price, split.vault)} token="usdc" />} />
      <StatRow
        icon="user-group"
        label="Referral"
        hint={referrer ? `To ${shortAddress(referrer)}` : "No referrer"}
        value={<Amount value={share(price, split.referral)} token="usdc" />}
      />
      <div className="flex justify-between pt-1 text-[11px] text-muted-foreground">
        <span>Split</span>
        <span className="font-mono tabular-nums">
          {pct(split.burn)} · {pct(split.vault)} · {pct(split.referral)}
        </span>
      </div>
    </div>
  );
}
