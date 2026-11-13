import type { CSSProperties } from "react";
import { COLOSSUS_HEART_SHARE, formatFixed, formatInteger } from "@paved/game-core";
import type { ColossusLotState, ColossusTierState } from "../../data/colossus-source";
import { cn } from "../../lib/utils";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** The week's days, 0 Monday to 6 Sunday. */
export const COLOSSUS_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** A share of the site in percent, one decimal, cut (never rounded up: 100% is every stone set). */
export const colossusShare = (stones: number, cells: number): string => `${formatFixed(Math.floor((stones * 1000) / Math.max(1, cells)) / 10, 1)}%`;

export interface ColossusGaugeProps {
  stones: number;
  cells: number;
  builders: number;
  tiers: readonly ColossusTierState[];
  /** When the week started, in seconds: a tier's day is counted from it. */
  weekStart: number;
  /** The Cobbles the viewer can claim now; 0: none. */
  toClaim?: number;
  /** The viewer laid a tile this week: only a participant is paid. */
  participant?: boolean;
  claiming?: boolean;
  onClaim?: () => void;
  className?: string;
}

/**
 * The Colossus's gauge (the weekly collective event): the stones set over the site's cells, its four tiers on the bar, each with its
 * Cobbles and the day it was reached, and Claim for the tiers reached (paid to every builder who laid a tile, from the tier's time).
 */
export function ColossusGauge({ stones, cells, builders, tiers, weekStart, toClaim = 0, participant = false, claiming = false, onClaim, className }: ColossusGaugeProps) {
  const share = colossusShare(stones, cells);
  return (
    <section aria-label="The gauge" data-slot="colossus-gauge" className={cn("drawer-carved flex flex-col gap-2.5 rounded-2xl px-3.5 py-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <span className="numeric text-outline font-display text-4xl leading-none font-bold text-primary">{share}</span>
        <span className="text-right text-[0.8125rem] leading-tight font-semibold text-muted-foreground">
          <span className="numeric text-foreground">{formatInteger(stones)}</span> of <span className="numeric text-foreground">{formatInteger(cells)}</span> stones
          <br />
          <span className="numeric text-foreground">{formatInteger(builders)}</span> builders
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-input" role="progressbar" aria-label="Stones set" aria-valuemin={0} aria-valuemax={cells} aria-valuenow={stones} aria-valuetext={share}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(stones * 100) / Math.max(1, cells)}%` }} />
        {tiers.slice(0, -1).map((t) => (
          <span key={t.share} aria-hidden className="absolute inset-y-0 w-0.5 bg-background/80" style={{ left: `${t.share}%` }} />
        ))}
      </div>
      <ul aria-label="Tiers" className="grid grid-cols-2 gap-x-3 gap-y-1">
        {tiers.map((t) => (
          <li key={t.share} data-reached={t.reachedAt !== null || undefined} className={cn("flex items-center gap-1.5 text-[0.8125rem] font-semibold", t.reachedAt === null ? "text-muted-foreground" : "text-foreground")}>
            <Icon name={t.reachedAt === null ? "circle" : "check"} size="xs" fixedWidth className={t.reachedAt === null ? undefined : "text-success"} label={t.reachedAt === null ? "To come:" : "Reached:"} />
            <span className="numeric font-bold">{t.share}%</span>
            <span className="flex items-center gap-0.5">
              <TokenIcon kind="cobbles" size="sm" px={16} className="size-4" />
              <span className="numeric">{t.cobbles}</span>
            </span>
            <span className="min-w-0 text-xs text-muted-foreground">
              {t.reachedAt === null ? (t.share === COLOSSUS_HEART_SHARE ? "the heart opens" : "") : `${COLOSSUS_DAY_NAMES[Math.min(6, Math.max(0, Math.floor((t.reachedAt - weekStart) / 86_400)))]!.slice(0, 3)}${t.claimed ? " · claimed" : ""}`}
            </span>
          </li>
        ))}
      </ul>
      {toClaim > 0 ? (
        <Button className="bg-success text-background" loading={claiming} onClick={onClaim}>
          <TokenIcon kind="cobbles" size="md" className="size-6" px={24} />
          Claim +{formatInteger(toClaim)} Cobbles
        </Button>
      ) : (
        !participant && <p className="text-xs font-semibold text-muted-foreground">The tiers pay every builder who laid at least one tile this week, whenever the tier came.</p>
      )}
    </section>
  );
}

export interface ColossusSiteProps {
  /** The lots a side. */
  side: number;
  lots: readonly ColossusLotState[];
  heartOpen: boolean;
  /** The boards with a hard hole the viewer holds a tile for: marked. */
  marked?: readonly number[];
  onLot?: (board: number) => void;
  className?: string;
}

/** A lot's fill by its stones: from the drawer's stone to the gold. */
const fillOf = (lot: ColossusLotState): CSSProperties => ({ backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round((lot.stones * 70) / Math.max(1, lot.cells))}%, var(--secondary))` });

/**
 * The Colossus's site as a map: its lots a side, each district shaded by its stones with its share, the heart across the four
 * middle lots (locked until the gauge reaches 50%). A tap opens a board; a complete one shows a check.
 */
export function ColossusSite({ side, lots, heartOpen, marked = [], onLot, className }: ColossusSiteProps) {
  const heart = lots.filter((l) => l.heart);
  const first = heart[0];
  return (
    <div data-slot="colossus-site" className={cn("grid gap-1", className)} style={{ gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))` }}>
      {lots.map((lot) => {
        if (lot.heart && lot !== first) return null;
        const complete = lot.holes === 0;
        const locked = lot.heart && !heartOpen;
        const share = colossusShare(lot.stones, lot.cells);
        return (
          <button
            key={`${lot.col},${lot.row}`}
            type="button"
            data-lot={lot.board}
            data-complete={complete || undefined}
            aria-label={`${lot.heart ? "The heart" : `District ${lot.name}`}: ${share} set${complete ? ", complete" : `, ${formatInteger(lot.holes)} holes`}${locked ? ", opens at 50%" : ""}${marked.includes(lot.board) ? ", a hard hole waits for your tile" : ""}`}
            onClick={() => onLot?.(lot.board)}
            style={{ ...fillOf(lot), gridColumn: lot.heart ? `${lot.col + 1} / span 2` : lot.col + 1, gridRow: lot.heart ? `${lot.row + 1} / span 2` : lot.row + 1 }}
            className={cn("state-layer relative flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-(--hud-outline) p-0.5", lot.heart && "border-primary")}
          >
            {locked ? <UiIcon name="padlock" px={28} className="size-7" /> : complete ? <Icon name="check" size="sm" className="text-foreground" /> : null}
            <span className="text-outline text-xs leading-none font-bold">{lot.heart ? "Heart" : lot.name}</span>
            <span className="numeric text-outline text-xs leading-none font-bold">{share}</span>
            {marked.includes(lot.board) && <span aria-hidden className="absolute top-1 right-1 size-2.5 rounded-full border border-background bg-info" />}
          </button>
        );
      })}
    </div>
  );
}
