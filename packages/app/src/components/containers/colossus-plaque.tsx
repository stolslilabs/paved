import { COLOSSUS_NAME_TILES, COLOSSUS_TOP, formatInteger } from "@paved/game-core";
import type { ColossusBuilderRow, ColossusResult } from "../../data/colossus-source";
import { cn } from "../../lib/utils";
import { PlayerName } from "../elements/player-name";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { colossusShare } from "./colossus-site";

/** The builders by stones set: each with their place, their tiles and stones, and the Cobbles a place of the top 10 pays. */
export function ColossusBuilders({ rows, label, onOpenPlayer, className }: { rows: readonly ColossusBuilderRow[]; label: string; onOpenPlayer?: (address: string) => void; className?: string }) {
  return (
    <ol aria-label={label} className={cn("drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl", className)}>
      {rows.map((r) => (
        <li key={r.profile.address} data-me={r.me || undefined} className={cn("flex min-h-12 items-center gap-2.5 px-3 py-1", r.me && "bg-info/15")}>
          <span className="numeric w-7 shrink-0 text-sm font-bold text-muted-foreground">{formatInteger(r.place)}</span>
          <button type="button" onClick={() => onOpenPlayer?.(r.profile.address)} className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left">
            <PlayerName name={r.profile.name} address={r.profile.address} className="max-w-full text-sm font-bold" />
            <span className="text-xs font-semibold text-muted-foreground">
              {r.me ? "you · " : ""}
              <span className="numeric">{formatInteger(r.tiles)}</span> {r.tiles === 1 ? "tile" : "tiles"}
            </span>
          </button>
          {r.cobbles > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-muted-foreground" title={`The place pays ${r.cobbles} Cobbles`}>
              <TokenIcon kind="cobbles" size="sm" px={16} className="size-4" />
              <span className="numeric">{formatInteger(r.cobbles)}</span>
            </span>
          )}
          <span className="flex w-14 shrink-0 flex-col items-end">
            <span className="numeric text-outline text-base leading-tight font-bold">{formatInteger(r.stones)}</span>
            <span className="text-xs leading-none font-semibold text-muted-foreground">stones</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export interface ColossusPlaqueProps {
  result: ColossusResult;
  claiming?: boolean;
  onClaim?: (week: number) => void;
  onOpenPlayer?: (address: string) => void;
  className?: string;
}

/**
 * A finished Colossus (the weekly collective event), shown the week after: whether the monument was completed and the gauge it
 * reached, its plaque (the ten builders with the most stones, each with their Cobbles, and the capstone, whoever laid the completing
 * tile), then the viewer's part: their place, tiles and stones, the name they won, and Claim for their tiers and their place.
 */
export function ColossusPlaque({ result, claiming = false, onClaim, onOpenPlayer, className }: ColossusPlaqueProps) {
  const complete = result.completedAt !== null;
  const me = result.me;
  return (
    <section aria-label="Last week's Colossus" data-slot="colossus-plaque" data-complete={complete || undefined} className={cn("drawer-carved flex flex-col gap-3 rounded-2xl px-3.5 py-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="rounded-md bg-background/70 px-2 py-px text-xs font-extrabold tracking-widest uppercase">Last week</span>
        <h3 className={cn("text-outline font-display text-2xl leading-none font-bold", complete ? "text-primary" : "text-foreground")}>{complete ? "Complete!" : colossusShare(result.stones, result.cells)}</h3>
      </div>
      <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <UiIcon name="trophy" px={24} className="drawer-icon size-6 shrink-0" />
        <span>
          <strong className="text-foreground">{result.monument}</strong>: <span className="numeric text-foreground">{formatInteger(result.stones)}</span> of <span className="numeric text-foreground">{formatInteger(result.cells)}</span> stones by{" "}
          <span className="numeric text-foreground">{formatInteger(result.builders)}</span> builders.
          {result.capstone && (
            <>
              {" "}
              The capstone: <strong className="text-primary wrap-anywhere">{result.capstone}</strong>.
            </>
          )}
        </span>
      </p>
      {result.plaque.length > 0 && <ColossusBuilders rows={result.plaque} label={`The plaque: the top ${COLOSSUS_TOP}`} onOpenPlayer={onOpenPlayer} className="bg-background/30" />}
      {me ? (
        <>
          <p data-slot="colossus-mine" className="text-sm font-semibold text-muted-foreground">
            You: <span className="numeric text-foreground">#{formatInteger(me.place)}</span> with <span className="numeric text-foreground">{formatInteger(me.tiles)}</span> {me.tiles === 1 ? "tile" : "tiles"} and{" "}
            <span className="numeric text-foreground">{formatInteger(me.stones)}</span> stones.{" "}
            {me.named ? (
              <>
                Your name wears <strong className="text-foreground">{result.stone}</strong>.
              </>
            ) : (
              <>
                {COLOSSUS_NAME_TILES} tiles in a week put your name in {result.stone}.
              </>
            )}
          </p>
          {me.toClaim > 0 ? (
            <Button className="bg-success text-background" loading={claiming} onClick={() => onClaim?.(result.week)}>
              <TokenIcon kind="cobbles" size="md" className="size-6" px={24} />
              Claim +{formatInteger(me.toClaim)} Cobbles
            </Button>
          ) : (
            me.cobbles > 0 && (
              <span className="flex h-11 items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
                <Icon name="check" size="sm" /> {formatInteger(me.cobbles)} Cobbles claimed
              </span>
            )
          )}
        </>
      ) : (
        <p className="text-xs font-semibold text-muted-foreground">You laid no tile last week: the Cobbles go to the builders who did.</p>
      )}
    </section>
  );
}
