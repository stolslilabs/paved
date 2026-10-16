import type { SplitView } from "@paved/chain";
import { cn } from "../../lib/utils";
import { Separator } from "../ui/separator";
import { Amount, TOKENS } from "../elements/amount";
import { ShortAddress } from "../elements/short-address";
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
/** Cut to what `Amount` shows (cents of USDC), so the parts on screen add up to the price on screen. */
const SHOWN = 10n ** BigInt(TOKENS.usdc.decimals - TOKENS.usdc.fraction);
const shown = (amount: bigint) => amount - (amount % SHOWN);

/**
 * The price of a stake, its boost, and where the USDC goes (`split_bps`, V1b): the burn's part, the Vault's part, and
 * with a referrer, the referral paid out of the Vault's part. Without one the Vault keeps it.
 */
export function PriceBreakdown({ stake, price, boostBps, split, referrer, className }: PriceBreakdownProps) {
  // Burn and referral cut as shown; the Vault is the shown price minus the two: 6.00 = 4.42 + 1.28 + 0.30.
  const burn = shown(share(price, split.burn));
  const referral = referrer ? shown(share(price, split.referral)) : 0n;
  const vault = shown(price) - burn - referral;
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">Price for stake {stake}</span>
          <Amount value={price} token="usdc" className="text-3xl text-foreground" />
        </span>
        <span className="flex flex-col items-end">
          <span className="text-xs text-muted-foreground">Burn boost</span>
          <span className="numeric text-lg font-semibold text-success">+{pct(boostBps - 10_000)}</span>
        </span>
      </div>
      <Separator />
      <StatRow icon="arrow-trend-up" label="Burned" hint="Buys PAVED and burns it, boosted" value={<Amount value={burn} token="usdc" />} />
      <StatRow icon="piggy-bank" label="Vault" hint="Paid to the vPAVED holders" value={<Amount value={vault} token="usdc" />} />
      <StatRow
        icon="user-group"
        label="Referral"
        hint={referrer ? <>To <ShortAddress address={referrer} /></> : "No referrer: the Vault keeps it"}
        value={<Amount value={referral} token="usdc" />}
      />
      <div className="flex flex-wrap justify-between gap-x-3 pt-1 text-[11px] text-muted-foreground">
        <span>Split</span>
        <span className="numeric min-w-0 text-right">
          burn {pct(split.burn)} · Vault {pct(split.vault)} · referral {pct(split.referral)} from the Vault
        </span>
      </div>
    </div>
  );
}
