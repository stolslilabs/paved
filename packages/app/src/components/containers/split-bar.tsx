import type { SplitView } from "@paved/chain";
import { cn } from "../../lib/utils";

/** Bps as a percentage: 7,368 is "73.68%". */
export const formatBps = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export interface SplitBarProps {
  /** `Economy.split_bps()` (V1b): burn + vault = 10,000; the referral is paid out of the Vault's part. */
  split: SplitView;
  /** The part the page is about: drawn in gold, the others muted. */
  highlight?: "burn" | "vault" | "referral";
  className?: string;
}

/**
 * Where each purchase's price goes, as one bar: the burn's part, then the Vault's, the referral cut out of the Vault's end
 * (paid to a referrer when there is one, else kept by the Vault). Owner-set: the figures are the chain's, never constants.
 */
export function SplitBar({ split, highlight, className }: SplitBarProps) {
  const parts = [
    { key: "burn", label: "Burned", bps: split.burn, hint: "buys PAVED, burns it" },
    { key: "vault", label: "Vault", bps: split.vault - split.referral, hint: "the referral included" },
    { key: "referral", label: "Referral", bps: split.referral, hint: "out of the Vault's part" },
  ] as const;
  const fill = (key: (typeof parts)[number]["key"]) =>
    highlight === key ? "bg-primary" : key === "burn" ? "bg-ink-500" : key === "vault" ? "bg-gold-800" : "bg-gold-600";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div role="img" aria-label={parts.map((p) => `${p.label} ${formatBps(p.bps)}`).join(", ")} className="flex h-3 w-full overflow-hidden rounded-full bg-input">
        {parts.map((p) => (
          <span key={p.key} className={cn("h-full border-r-2 border-card last:border-r-0", fill(p.key))} style={{ width: `${p.bps / 100}%` }} />
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {parts.map((p) => (
          <div key={p.key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-start gap-1.5 text-muted-foreground">
              {/* On the label's first line (16 px, text-xs), not centred on a label that wraps. */}
              <span aria-hidden className={cn("mt-1 size-2 shrink-0 rounded-full", fill(p.key))} />
              <span className="wrap-anywhere">{p.label}</span>
            </dt>
            <dd className={cn("numeric text-sm font-semibold", highlight === p.key && "text-primary")}>
              {formatBps(p.key === "vault" ? split.vault : p.bps)}
            </dd>
            {/* The description wraps (WRAP360): a third of a phone is too narrow for one line, and a cut sentence says nothing. */}
            <dd className="text-[11px] leading-snug wrap-anywhere text-muted-foreground">{p.hint}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
