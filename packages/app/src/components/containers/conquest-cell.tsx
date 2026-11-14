import { useEffect, useState } from "react";
import { CONQUEST_ODDS, formatInteger } from "@paved/game-core";
import type { ConquestOptions, ConquestRequestState, ConquestTileState } from "../../data/conquest-source";
import { cn } from "../../lib/utils";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { RARITY_NAME } from "../elements/rarity-badge";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** A cell of the Conquest's map as the viewer's allegiance meets it. */
export interface ConquestCellInfo {
  x: number;
  y: number;
  /** The tile built on it; null: none. */
  tile: ConquestTileState | null;
  /** The allegiance's open request on it; null: none. */
  request: ConquestRequestState | null;
  explored: boolean;
  /** Explored, empty and next to a tile of the allegiance: a request may go there. */
  frontier: boolean;
  /** Its zone is a province (its odds), and is open to the allegiance now. */
  province: boolean;
  open: boolean;
}

export interface ConquestCellActionProps {
  /** The cell picked; null: none, the hint. */
  cell: ConquestCellInfo | null;
  /** The viewer leads their allegiance (an Officer or the Leader): they open the requests. */
  leads: boolean;
  /** The orders the allegiance has left today. */
  orders: number;
  /** The viewer's exploration of the day is still to make (a day of play). */
  canExplore: boolean;
  /** What fits the picked cell; null while it is read. */
  options: ConquestOptions | null;
  /** The write on its way: its button waits. */
  busy?: "explore" | "request" | "give" | null;
  onExplore?: (cell: { x: number; y: number }) => void;
  onRequest?: (tile: { x: number; y: number; plan: number; orientation: number }) => void;
  onGive?: (request: number) => void;
  /** The tile to draw on the cell: the plan picked for a request in its turn, or the request's own; null: none. */
  onPreview?: (tile: { x: number; y: number; plan: number; orientation: number } | null) => void;
  tileArt?: TileArt;
  className?: string;
}

function Act({ word, name, on, busy, onAct }: { word: string; name?: string; on: boolean; busy: boolean; onAct: () => void }) {
  return (
    <Button variant="ghost" style={on ? GOLD_ACTION : undefined} className={cn("relative h-12 shrink-0 px-4 text-lg font-black text-foreground", !on && "bg-secondary")} disabled={!on || busy} aria-busy={busy || undefined} aria-label={name} onClick={onAct}>
      {on && !busy && <GoldShine />}
      {word}
    </Button>
  );
}

/**
 * What the viewer can do with the cell picked on the Conquest's map, said before its one action: a fog cell is explored (the zone's
 * odds first); for an Officer or the Leader a cell beside the allegiance's tiles lists the plans that fit, by the members who hold
 * one, and asks for the one picked; a cell with a request says what it wants and pays, and Give builds it; a tile says whose it is.
 */
export function ConquestCellAction({ cell, leads, orders, canExplore, options, busy = null, onExplore, onRequest, onGive, onPreview, tileArt, className }: ConquestCellActionProps) {
  // The plan picked for a request, with the place of its turn among those that fit; dropped with the cell.
  const [pick, setPick] = useState<{ x: number; y: number; plan: number; turn: number } | null>(null);
  const request = cell?.request ?? null;
  const asking = !!cell && !request && !cell.tile && cell.frontier && leads;
  const fog = !!cell && !request && !cell.tile && !cell.explored;
  const plans = asking && options && options.x === cell.x && options.y === cell.y ? options.plans : null;
  const chosen = pick && cell && pick.x === cell.x && pick.y === cell.y ? (plans?.find((p) => p.plan === pick.plan) ?? null) : null;
  const orientation = chosen ? chosen.orientations[pick!.turn % chosen.orientations.length]! : 1;
  const previewKey = !cell ? null : chosen ? `${cell.x},${cell.y},${chosen.plan},${orientation}` : request ? `r${request.id}` : null;
  useEffect(() => {
    onPreview?.(!cell ? null : chosen ? { x: cell.x, y: cell.y, plan: chosen.plan, orientation } : request ? { x: request.x, y: request.y, plan: request.plan, orientation: request.orientation } : null);
    // The preview follows what is shown, not each new callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);
  const text = "min-w-40 flex-1 text-sm font-semibold text-muted-foreground";
  return (
    <div data-slot="conquest-action" className={cn("flex min-h-12 flex-col gap-2", className)}>
      {request ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <TileChip plan={request.plan} orientation={request.orientation} art={tileArt} className="size-11" />
          <p className={text}>
            <strong className="text-foreground">{tileName(request.plan)}</strong> · {RARITY_NAME[request.rarity]} · <span className="numeric text-foreground">{formatInteger(request.holders)}</span> {request.holders === 1 ? "member holds" : "members hold"} one, you{" "}
            {request.held > 0 ? <span className="numeric text-foreground">{formatInteger(request.held)}</span> : "none"}. The gift pays <span className="numeric text-foreground">+{request.cobbles}</span> {request.cobbles === 1 ? "Cobble" : "Cobbles"}
            {orders < 1 && ", once an order is left"}.
          </p>
          <Act word="Give" name={`Give ${tileName(request.plan)} for ${request.cobbles} ${request.cobbles === 1 ? "Cobble" : "Cobbles"}`} on={request.held > 0 && orders > 0} busy={busy !== null} onAct={() => onGive?.(request.id)} />
        </div>
      ) : asking ? (
        plans === null ? (
          <p className={text}>Looking for the plans that fit…</p>
        ) : plans.length === 0 ? (
          <p className={text}>No plan fits this cell.</p>
        ) : (
          <>
            <ul aria-label="Plans that fit" className="flex flex-wrap gap-1.5">
              {plans.map((p) => (
                <li key={p.plan}>
                  <button
                    type="button"
                    aria-pressed={chosen?.plan === p.plan}
                    aria-label={`${tileName(p.plan)}, ${RARITY_NAME[p.rarity]}: ${p.holders} ${p.holders === 1 ? "member holds" : "members hold"} one`}
                    disabled={busy !== null}
                    onClick={() => setPick({ x: cell.x, y: cell.y, plan: p.plan, turn: 0 })}
                    className={cn("relative flex size-11 cursor-pointer items-center justify-center rounded-lg disabled:cursor-default", chosen?.plan === p.plan ? "ring-2 ring-primary" : "opacity-80")}
                  >
                    <TileChip plan={p.plan} art={tileArt} className="size-10" />
                    <span className={cn("numeric absolute -top-1 -right-1 rounded-full border border-background px-1 text-[0.75rem] leading-tight font-bold", p.holders > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{p.holders}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <p className={text}>{chosen ? `${tileName(chosen.plan)}: a request spends no order.` : "Pick the tile to ask for: the figure is the members who hold one."}</p>
              {chosen && chosen.orientations.length > 1 && (
                <Button variant="secondary" className="h-12" disabled={busy !== null} onClick={() => setPick({ ...pick!, turn: pick!.turn + 1 })}>
                  <Icon name="rotate-right" size="sm" /> Turn
                </Button>
              )}
              <Act word="Ask" name={chosen ? `Ask for ${tileName(chosen.plan)}` : "Ask"} on={chosen !== null} busy={busy !== null} onAct={() => chosen && onRequest?.({ x: cell.x, y: cell.y, plan: chosen.plan, orientation })} />
            </div>
          </>
        )
      ) : fog ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className={text}>
            {!cell.open ? (
              "This zone is closed to your allegiance for now."
            ) : (
              <>
                Nobody knows its Knowledge before:{" "}
                {CONQUEST_ODDS[cell.province ? "province" : "free"].map((o, i) => (
                  <span key={o.knowledge}>
                    {i > 0 && ", "}
                    <span className="numeric text-foreground">{o.knowledge}</span> (<span className="numeric">{o.share}%</span>)
                  </span>
                ))}
                .{!canExplore && " Your exploration of the day is made."}
              </>
            )}
          </p>
          <Act word="Explore" on={cell.open && canExplore} busy={busy !== null} onAct={() => onExplore?.({ x: cell.x, y: cell.y })} />
        </div>
      ) : cell?.tile ? (
        <p data-slot="conquest-tile-info" className={text}>
          {cell.tile.kind === "capital" ? (
            cell.tile.mine ? (
              "Your capital: your first tile."
            ) : (
              <>The capital of {cell.tile.guild?.name}.</>
            )
          ) : cell.tile.kind === "great" ? (
            "A Great Wonder: it closes when its eight neighbours are built, and pays the allegiance with the most of them."
          ) : cell.tile.kind === "wonder" ? (
            "A wonder: it closes when its eight neighbours are built."
          ) : (
            <>
              <strong className="text-foreground">{tileName(cell.tile.plan)}</strong>, {cell.tile.mine ? "your allegiance's" : <>of {cell.tile.guild?.name}</>}
              {cell.tile.by ? <>, given by {cell.tile.by}</> : null}.
            </>
          )}
        </p>
      ) : (
        <p className={text}>
          {cell
            ? leads
              ? "Explored. A tile goes next to one of yours: tap a marked cell to ask for one."
              : "Explored. An Officer or the Leader asks for the tiles."
            : canExplore
              ? leads
                ? "Tap a fog cell to explore it, a marked cell beside your tiles to ask for a tile, or a request to give its tile."
                : "Tap a fog cell to explore it, or a request to give its tile."
              : leads
                ? "Tap a marked cell beside your tiles to ask for a tile, or a request to give its tile."
                : "Your exploration of the day is made. Tap a request to give its tile."}
        </p>
      )}
    </div>
  );
}
