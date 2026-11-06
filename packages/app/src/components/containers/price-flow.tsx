import type { CSSProperties, ReactNode } from "react";
import type { SplitView } from "@paved/chain";
import { formatBps, formatUnits } from "@paved/game-core";
import { ShortAddress } from "../elements/short-address";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { UsdcLogo } from "../elements/usdc-logo";

export interface PriceFlowProps {
  /** USDC base units (`QuoteView.price`). */
  price: bigint;
  /** `Economy.split_bps()`: burn + vault = 10,000; the referral is paid out of the Vault's part. */
  split: SplitView;
  /** The referrer from `?ref=`, or null: the Vault then keeps the referral's part. */
  referrer: string | null;
  /** The burn's boost at this stake, bps (`10_000 + 100 x stake`). */
  boostBps: number;
}

const share = (price: bigint, bps: number) => (price * BigInt(bps)) / 10_000n;
/** Cut to what is shown (cents of USDC), so the parts on screen add up to the price on screen. */
const CENT = 10_000n;
const shown = (amount: bigint) => amount - (amount % CENT);
const usdc = (amount: bigint) => formatUnits(amount, 6, 2);

/** Each recipient's colour on the bar: the burn's fire, the Vault's silver (vPAVED's), the referral's green; lit along its top, shaded at its foot. */
const fill = (from: string, to: string): CSSProperties => ({
  backgroundImage: `linear-gradient(${from}, ${to})`,
  boxShadow: "inset 0 2px 0 color-mix(in oklab, var(--foreground) 35%, transparent), inset 0 -2px 0 color-mix(in oklab, var(--background) 30%, transparent)",
});
const FILLS = {
  burn: fill("var(--warning)", "var(--destructive)"),
  vault: fill("color-mix(in oklab, var(--medal-2) 70%, var(--foreground))", "color-mix(in oklab, var(--medal-2) 80%, var(--background))"),
  referral: fill("color-mix(in oklab, var(--success) 80%, var(--foreground))", "var(--success)"),
} as const;

/** Two portions meet on a straight line, the HUD's outline (the owner's ask of 2026-11-06): only the bar's two ends are rounded. */
const JOIN: CSSProperties = { borderLeft: "2px solid var(--hud-outline)" };

type Part = { key: keyof typeof FILLS; art: UiIconName; label: string; amount: bigint; bps: number; hint: ReactNode };

/**
 * The split of the stake's USDC (PLAY-PAGE, the owner's asks of 2026-11-06: the Vault's bar, each recipient's portion, painted icons):
 * one bar rounded at its ends, a portion per recipient in its colour joined straight to the next, the burn's, the Vault's and the referral's (cut out of the Vault's end, kept by it
 * without a referrer); under it a tile per recipient, its painted icon (the burning coin, the piggy bank fed a vPAVED coin, the
 * handshake over a coin; Codex's), its share and its amount, the burn's boost on the burn's. The figures are the chain's split, never
 * constants; the parts are cut to the cent so they add up to the price shown.
 */
export function PriceFlow({ price, split, referrer, boostBps }: PriceFlowProps) {
  const burn = shown(share(price, split.burn));
  const referral = referrer ? shown(share(price, split.referral)) : 0n;
  const vault = shown(price) - burn - referral;
  const parts: Part[] = [
    { key: "burn", art: "flow-burn", label: "Burned", amount: burn, bps: split.burn, hint: <>Buys PAVED and burns it, boosted <span className="numeric font-bold text-success">+{formatBps(boostBps - 10_000)}</span></> },
    { key: "vault", art: "flow-vault", label: "Vault", amount: vault, bps: referrer ? split.vault - split.referral : split.vault, hint: "Paid to the vPAVED holders" },
    {
      key: "referral",
      art: "flow-referral",
      label: "Referral",
      amount: referral,
      bps: referrer ? split.referral : 0,
      hint: referrer ? (
        <>
          To <ShortAddress address={referrer} />
        </>
      ) : (
        "No referrer: the Vault keeps it"
      ),
    },
  ];
  const total = shown(price);
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={parts.map((p) => `${p.label} ${formatBps(p.bps)}`).join(", ")} className="drawer-carved h-6 w-full rounded-full p-1">
        <div className="flex size-full overflow-hidden rounded-full">
          {parts
            .filter((p) => p.amount > 0n)
            .map((p, i) => (
              <span key={p.key} style={{ ...FILLS[p.key], ...(i > 0 ? JOIN : null), width: `${total === 0n ? 0 : Number((p.amount * 10_000n) / total) / 100}%` }} className="h-full" />
            ))}
        </div>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <li key={p.key} className="drawer-carved flex min-w-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center">
            <UiIcon name={p.art} px={44} className="drawer-icon size-11" />
            <span className="flex items-center gap-1.5">
              <span aria-hidden style={FILLS[p.key]} className="size-2.5 shrink-0 rounded-full" />
              <span className="text-outline text-sm font-bold">{p.label}</span>
            </span>
            <span className="numeric text-outline text-lg leading-tight font-bold">{formatBps(p.bps)}</span>
            <span className="flex items-center gap-1 text-sm font-semibold">
              <UsdcLogo className="size-4" />
              <span className="numeric">{usdc(p.amount)}</span>
            </span>
            <span className="text-xs leading-snug wrap-anywhere text-muted-foreground">{p.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
