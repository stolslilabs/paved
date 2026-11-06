import type { CSSProperties } from "react";
import * as m from "motion/react-m";
import { formatUnits } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { BLACK_OUTLINE } from "../elements/black-outline";
import { stakeArtSources } from "../elements/play-art";
import { ARROW, Arrow } from "./league-carousel";

export interface StakePickerProps {
  /** The stake, 1 to `max`. */
  value: number;
  /** The highest stake (`MAX_STAKE`, 10). */
  max?: number;
  /** One stake's price, USDC base units (the quote's price over its stake): the picker speaks in USDC, never in stakes. */
  unit: bigint;
  /** The quote's price for `value`, USDC base units; the unit times the stake when omitted. */
  price?: bigint;
  disabled?: boolean;
  onChange?: (stake: number) => void;
  className?: string;
}

/** USDC base units in a whole token. */
const USDC = 1_000_000n;
/** USDC as the picker writes it: whole USDC without decimals, cents when there are any. */
const usdc = (value: bigint) => formatUnits(value, 6, value % USDC === 0n ? 0 : 2);

/** The painting's width, CSS px (its frame 3:2): the widest pile, twenty coins, within the arrows on a 320 px phone. */
const ART_PX = 192;
const ART: CSSProperties = { width: ART_PX, maxWidth: "100%", aspectRatio: "3 / 2" };
/** The amount in the paintings' own outline (the chests' Take's), so it reads as part of the pile. */
const AMOUNT: CSSProperties = { textShadow: BLACK_OUTLINE };

/**
 * The stake, in USDC (PLAY-PAGE, the owner's choices of 2026-11-06): a painting per stake, USDC's coins piled higher stake by stake
 * (`STAKE_ART`, Codex's), springing in as it changes; under it the price in the body's font at its boldest, white and outlined thick in
 * black as the painting is, its digits of one width; the League's arrows either side (its carousel's, thin and muted) lower or raise
 * it a stake at a time, each off at its end. The neighbours' paintings are fetched ahead, so an arrow never waits for one. The price is
 * read out as it changes ("6 USDC").
 */
export function StakePicker({ value, max = 10, unit, price, disabled, onChange, className }: StakePickerProps) {
  const total = price ?? unit * BigInt(value);
  const figure = usdc(total);
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <Button variant="ghost" size="icon" className={ARROW} aria-label="Lower the stake" disabled={disabled || value <= 1} onClick={() => onChange?.(value - 1)}>
        <Arrow to="left" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <span aria-hidden style={ART} className="relative block">
          <m.img
            key={value}
            {...stakeArtSources(value, ART_PX)}
            alt=""
            draggable={false}
            initial={{ scale: 0.85, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 18 }}
            className="absolute inset-0 size-full origin-bottom object-contain"
          />
          {[value - 1, value + 1]
            .filter((n) => n >= 1 && n <= max)
            .map((n) => (
              <img key={n} {...stakeArtSources(n, ART_PX)} alt="" draggable={false} className="hidden" />
            ))}
        </span>
        <output
          aria-live="polite"
          aria-label={`Stake: ${figure} USDC`}
          style={AMOUNT}
          className="-mt-1 flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5 font-black text-foreground tabular-nums"
        >
          <span data-testid="stake-value" className={cn("min-w-0 text-center leading-none wrap-anywhere", figure.length > 9 ? "text-3xl" : figure.length > 5 ? "text-4xl" : "text-5xl")}>
            {figure}
          </span>
          <span className="text-2xl leading-none">USDC</span>
        </output>
      </div>
      <Button variant="ghost" size="icon" className={ARROW} aria-label="Raise the stake" disabled={disabled || value >= max} onClick={() => onChange?.(value + 1)}>
        <Arrow to="right" />
      </Button>
    </div>
  );
}
