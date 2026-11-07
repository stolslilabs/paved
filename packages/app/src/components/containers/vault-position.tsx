import type { CSSProperties, ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import type { SplitView, VaultPosition as Position } from "@paved/chain";
import { cn } from "../../lib/utils";
import { amountFigure, formatUnits } from "../elements/amount";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { vaultLightSources } from "../elements/vault-art";
import { VaultArtImage } from "../elements/vault-art-image";
import { formatBps } from "./split-bar";
import { pavedUsd, VaultNotes } from "./vault-form";

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

/** The coin's size, and its light's, in px: the book's coin about a quarter of the box's width on a phone. */
const COIN = 80;
const LIGHT = 152;

/** A light's box, centred on the coin's. */
const LIGHT_BOX: CSSProperties = { width: LIGHT, height: LIGHT, left: (COIN - LIGHT) / 2, top: (COIN - LIGHT) / 2, maxWidth: "none" };
/** The pulse at the coin's heart: white fading through silver (vPAVED's, the medal's) to nothing. */
const PULSE: CSSProperties = {
  ...LIGHT_BOX,
  borderRadius: "50%",
  background: "radial-gradient(closest-side, var(--foreground), color-mix(in oklab, var(--medal-2) 55%, transparent) 45%, transparent)",
};

/**
 * The vPAVED coin, large, in its silver light (the book's POSITION; the owner's asks of 2026-11-07: silver, and alive as the opened
 * chest's, `chest-art.tsx`): behind the coin two layers of Codex's light (`VAULT_LIGHTS`) turning either way and breathing, the broad rays
 * one way, the fine starburst and its sparkles the other, and a pulse at its heart. Under reduced motion the two layers stand still.
 * `lit` (`position.shares > 0n`, the owner's #1053): the light runs only while the player holds a position; at zero shares the coin
 * stands alone, no layer and no pulse. The lights are absolutely positioned, so the coin keeps its 80 px box either way.
 */
function GlowingCoin({ lit }: { lit: boolean }) {
  const reduced = useReducedMotionConfig() ?? false;
  const layer = "pointer-events-none absolute select-none";
  return (
    <span aria-hidden data-slot="vault-coin" data-lit={lit || undefined} className="relative size-20 shrink-0">
      {lit && (
        <>
          <m.img
            {...vaultLightSources("coin-rays", LIGHT)}
            alt=""
            draggable={false}
            className={layer}
            style={{ ...LIGHT_BOX, opacity: 0.75 }}
            animate={reduced ? { rotate: 0 } : { rotate: 360, scale: [1, 1.08, 1] }}
            transition={reduced ? { duration: 0 } : { rotate: { duration: 14, repeat: Infinity, ease: "linear" }, scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } }}
          />
          <m.img
            {...vaultLightSources("coin-glow", LIGHT)}
            alt=""
            draggable={false}
            className={layer}
            style={LIGHT_BOX}
            animate={reduced ? { rotate: 0 } : { rotate: -360, opacity: [0.65, 1, 0.65] }}
            transition={reduced ? { duration: 0 } : { rotate: { duration: 22, repeat: Infinity, ease: "linear" }, opacity: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }}
          />
          {!reduced && (
            <m.span
              className="pointer-events-none absolute"
              style={PULSE}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 0.55, 0], scale: [0.6, 0.9, 0.6] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </>
      )}
      <TokenIcon kind="vpaved" px={COIN} className="relative size-20" />
    </span>
  );
}

/** A figure's tile (the Challenge's targets', carved as information is): its painted icon, its name, its figure. */
function Figure({ art, label, children }: { art: ReactNode; label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="drawer-carved flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 rounded-xl px-2 py-3 text-center">
      {art}
      <span className="text-outline text-sm leading-snug font-bold">{label}</span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

/** A tile's figure, a step smaller under 360 px, where two tiles share a phone's width (the Challenge's). */
const FIGURE = "numeric text-outline text-base leading-tight font-bold mobile:text-xl";

export interface VaultPositionProps {
  position: Position;
  /** `Economy.rate()`, the guard's swap rate (PAVED base units per USDC base unit x 1e18): the dollar figures; null or 0, none. */
  guardRate?: bigint | null;
  /** `Economy.split_bps()`: the notes' line on the Vault's part of each purchase; null or omitted, not said. */
  split?: SplitView | null;
  className?: string;
}

/** A chip of figures under the tiles (the Challenge's "1 PAVED ≈ $X"): carved, as information is. */
const CHIP = "drawer-carved flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold";

/**
 * The player's vPAVED (VAULT-PAGE, after the Paved UX Book's POSITION, the Challenge's stake panel, and the figures of Glitchbomb's
 * staking page the owner pointed at): under its painted title, a carved box with the vPAVED coin in its light, the vPAVED held, their
 * part of every vPAVED (`shares / total_supply`, the dead shares counted) and the supply, their worth in PAVED at the rate
 * (`convert_to_assets`, before the exit fee) and in dollars at the guard's rate; under it two tiles alike, what leaves now once the fee
 * is taken (`max_withdraw`) and the exit fee; then the rates as chips: one vPAVED in PAVED (rounded down) and one PAVED in dollars. No
 * position yet: the same box at zero, the coin unlit (no light, no pulse), so nothing moves on the first deposit.
 */
export function VaultPosition({ position, guardRate, split, className }: VaultPositionProps) {
  const rate = vaultRate(position.totalAssets, position.totalSupply);
  const share = shareBps(position.shares, position.totalSupply);
  const worth = pavedUsd(position.value, guardRate);
  const one = pavedUsd(E18, guardRate, 4);
  return (
    <section aria-labelledby="vault-position" className={cn("flex flex-col gap-3", className)}>
      <SectionTitle id="vault-position">
        <VaultArtImage name="position" px={28} className="drawer-icon size-7 self-center" />
        Position
      </SectionTitle>
      <div className="drawer-carved flex items-center gap-4 overflow-hidden rounded-2xl p-4">
        <GlowingCoin lit={position.shares > 0n} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-muted-foreground">Your share</span>
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="numeric text-outline text-2xl leading-tight font-bold wrap-anywhere">{amountFigure(position.shares, "vpaved")}</span>
            <span className="text-outline text-base font-bold">vPAVED</span>
          </span>
          <span aria-label="Share of the Vault" role="group" className="text-sm font-semibold wrap-anywhere text-muted-foreground">
            <span className="numeric text-foreground">{share === 0 && position.shares > 0n ? "< 0.01%" : formatBps(share)}</span> of{" "}
            <span className="numeric">{amountFigure(position.totalSupply, "vpaved", true)}</span> vPAVED
          </span>
          <span aria-label="Worth" role="group" className="text-sm font-semibold wrap-anywhere text-muted-foreground">
            ≈ <span className="numeric text-foreground">{amountFigure(position.value, "paved", true)}</span> PAVED
            {worth !== null && (
              <>
                {" "}
                · <span className="numeric text-foreground">${worth}</span>
              </>
            )}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <Figure art={<VaultArtImage name="withdraw" px={44} className="drawer-icon size-11" />} label="Withdrawable now">
          <TokenIcon kind="paved" size="md" />
          <span className={cn(FIGURE, "wrap-anywhere")}>{amountFigure(position.maxWithdraw, "paved", true)}</span>
        </Figure>
        <Figure art={<VaultArtImage name="exit-fee" px={44} className="drawer-icon size-11" />} label="Exit fee">
          <span className={FIGURE}>{formatBps(position.exitFeeBps)}</span>
        </Figure>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <p aria-label="Rate" className={CHIP}>
          <TokenIcon kind="vpaved" size="sm" />
          <span>
            1 vPAVED ≈ <span className="numeric font-bold">{formatUnits(rate, 18, 4)}</span> PAVED
          </span>
        </p>
        {one !== null && (
          <p aria-label="PAVED price" className={CHIP}>
            <TokenIcon kind="paved" size="sm" />
            <span>
              1 PAVED ≈ <span className="numeric font-bold">${one}</span>
            </span>
          </p>
        )}
      </div>
      <VaultNotes label="How the Vault works" split={split} general />
    </section>
  );
}
