import { formatInteger, type MasterpieceKind, type MasterpieceProspect } from "@paved/game-core";
import type { MasterpieceShown } from "../../data/masterpiece-source";
import { cn } from "../../lib/utils";
import { HudFrame } from "../elements/hud-frame";
import { MASTERPIECE_KIND, pieceName } from "../elements/masterpiece-kind";

export interface MasterpieceStripProps {
  kind: MasterpieceKind;
  /** The masterpiece so far; null: none closed yet. */
  piece: MasterpieceShown | null;
  /** The open structure of the kind worth the most if it closed now. */
  prospect: MasterpieceProspect | null;
  /** The tiles waiting today, and those the days after bring. */
  waiting: number;
  toCome: number;
  className?: string;
}

/**
 * The Masterpiece board's strip, under its header (the weekly individual event): the masterpiece so far, the open structure the
 * builder is growing with what it would score if closed now, and the tiles waiting. On the HUD's frame, as the board's notices.
 */
export function MasterpieceStrip({ kind, piece, prospect, waiting, toCome, className }: MasterpieceStripProps) {
  const name = MASTERPIECE_KIND[kind].name;
  return (
    <div data-slot="masterpiece-strip" className={cn("relative isolate flex items-center gap-3 px-2.5 py-2", className)}>
      <HudFrame px={13} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-outline text-sm leading-tight font-bold">
          {piece ? (
            <>
              {pieceName(kind, piece.size)} · <span className="numeric">{formatInteger(piece.points)}</span>
            </>
          ) : (
            `No ${name} closed yet`
          )}
        </h2>
        <p className="text-xs leading-snug font-semibold text-muted-foreground">
          {prospect ? (
            <>
              Open {name} of <span className="numeric text-foreground">{formatInteger(prospect.size)}</span>, <span className="numeric text-foreground">{formatInteger(prospect.open)}</span> {prospect.open === 1 ? "edge" : "edges"} open:{" "}
              <span className="numeric font-bold text-foreground">{formatInteger(prospect.worth)}</span> if closed now
            </>
          ) : (
            `No open ${name}: only a closed one scores`
          )}
        </p>
      </div>
      <span className="flex shrink-0 flex-col items-end text-xs font-semibold text-muted-foreground">
        <span>
          <span className="numeric text-sm font-bold text-foreground">{waiting}</span> waiting
        </span>
        <span>
          <span className="numeric text-sm font-bold text-foreground">{toCome}</span> to come
        </span>
      </span>
    </div>
  );
}
