import { useEffect, useState, type ReactNode } from "react";
import { CONQUEST_ODDS, formatInteger } from "@paved/game-core";
import type { ConquestOptions, ConquestRequestState, ConquestTileState } from "../../data/conquest-source";
import { rankName } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { ConquestTile } from "../elements/conquest-art";
import { formatShortRemaining } from "../elements/countdown";
import { GoldButton } from "../elements/gold-button";
import { RARITY_NAME, RarityBadge } from "../elements/rarity-badge";
import { tileName, type TileRenders } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
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
  /** Seconds since the epoch: how long ago a request was opened. */
  now?: number;
  /** The write on its way: its button waits. */
  busy?: "explore" | "request" | "give" | null;
  onExplore?: (cell: { x: number; y: number }) => void;
  onRequest?: (tile: { x: number; y: number; plan: number; orientation: number }) => void;
  onGive?: (request: number) => void;
  /** The tile to draw on the cell: the plan picked for a request in its turn, or the request's own; null: none. */
  onPreview?: (tile: { x: number; y: number; plan: number; orientation: number } | null) => void;
  /** The panel's close: the cell is let go. */
  onClose?: () => void;
  /** The tiles' voxel renders (`useTileRenders`). */
  renders?: TileRenders;
  className?: string;
}

/** A panel of the map's foot: its title in the display font, a line under it, its close, then its body. */
function Panel({ slot, title, sub, onClose, children }: { slot: string; title: string; sub: ReactNode; onClose?: () => void; children: ReactNode }) {
  return (
    <section aria-label={title} data-slot="conquest-action" data-panel={slot} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-outline font-display text-2xl leading-tight font-bold">{title}</h3>
          <p className="text-sm font-semibold text-muted-foreground">{sub}</p>
        </div>
        {onClose && (
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 shrink-0 cursor-pointer place-items-center outline-none">
            <UiIcon name="close" px={36} className="size-9" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** One of a gift's three facts: its figure over its word. */
function Fact({ art, lead, sub }: { art: ReactNode; lead: ReactNode; sub: ReactNode }) {
  return (
    <li className="drawer-carved flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-center">
      {art}
      <span className="text-outline text-sm leading-tight font-bold">{lead}</span>
      <span className="text-xs leading-tight font-semibold text-muted-foreground">{sub}</span>
    </li>
  );
}

/**
 * What the viewer can do with the cell picked on the Conquest's map, as the proposal draws it, said before its one action. A fog
 * cell: Explore, the zone's odds first. For an Officer or the Leader, a cell beside the allegiance's tiles: "Choose the tile", the
 * plans that fit as cards, by the members who hold one, the one picked with its turn, then Ask. A cell with a request: "Build
 * request", who opened it, the tile and its cell, what the viewer holds, what the gift pays and spends, then Give. A tile says
 * whose it is. Every tile is its voxel render.
 */
export function ConquestCellAction({ cell, leads, orders, canExplore, options, now = 0, busy = null, onExplore, onRequest, onGive, onPreview, onClose, renders, className }: ConquestCellActionProps) {
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
  const where = cell ? (
    <>
      Cell <span className="numeric">{cell.x}</span>, <span className="numeric">{cell.y}</span>
    </>
  ) : null;
  const hint = (text: string) => (
    <p data-slot="conquest-action" className={cn("text-sm font-semibold text-muted-foreground", className)}>
      {text}
    </p>
  );

  if (request) {
    const inVillage = request.owned - request.held;
    return (
      <div className={className}>
        <Panel
          slot="request"
          title="Build request"
          onClose={onClose}
          sub={
            <>
              Opened by <strong className="text-foreground wrap-anywhere">{request.by.name ?? "a member"}</strong>, {rankName(request.byRank)}
              {now > request.at && (
                <>
                  {" "}
                  · <span className="numeric">{formatShortRemaining(now - request.at)}</span> ago
                </>
              )}
            </>
          }
        >
          <div className="drawer-carved flex items-center gap-3 rounded-2xl p-2.5">
            <ConquestTile plan={request.plan} orientation={request.orientation} renders={renders} className="size-20 border-2 border-primary/70" />
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span className="text-outline text-lg leading-tight font-bold">{tileName(request.plan)}</span>
              <RarityBadge rarity={request.rarity} />
              <span className="text-sm font-semibold text-muted-foreground">
                {where} · zone {request.zoneName}
              </span>
            </div>
          </div>
          <p data-slot="conquest-holding" data-can={request.held > 0} className={cn("flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm font-semibold", request.held > 0 ? "border-success/60 bg-success/10" : "border-border bg-secondary/40 text-muted-foreground")}>
            <Icon name={request.held > 0 ? "check" : "info"} size="sm" className={cn("mt-0.5", request.held > 0 && "text-success")} />
            <span>
              {request.owned === 0 ? (
                "You hold none of this tile: chests and the shop give them."
              ) : request.held === 0 ? (
                <>
                  You hold <span className="numeric">{request.owned}</span>, all in your village: none to give.
                </>
              ) : (
                <>
                  You hold <span className="numeric">{request.owned}</span>
                  {inVillage > 0 && (
                    <>
                      : <span className="numeric">{inVillage}</span> in your village
                    </>
                  )}
                  , <strong className="text-foreground">{request.held === 1 ? "one you can give" : `${request.held} you can give`}</strong>.
                </>
              )}
            </span>
          </p>
          <ul aria-label="The gift" className="grid grid-cols-3 gap-2">
            <Fact art={<TokenIcon kind="cobbles" size="sm" px={28} className="size-7" />} lead={<span className="numeric">+{request.cobbles} {request.cobbles === 1 ? "Cobble" : "Cobbles"}</span>} sub="for you" />
            <Fact art={<UiIcon name="hammer" px={28} className="size-7" />} lead="1 order" sub={<><span className="numeric">{formatInteger(orders)}</span> left today</>} />
            <Fact art={<UiIcon name="user" px={28} className="size-7" />} lead="Your name" sub="on the tile" />
          </ul>
          <GoldButton className="w-full" disabled={request.held === 0 || orders < 1} busy={busy !== null} aria-label={`Give ${tileName(request.plan)} for ${request.cobbles} ${request.cobbles === 1 ? "Cobble" : "Cobbles"}`} onClick={() => onGive?.(request.id)}>
            Give
          </GoldButton>
        </Panel>
      </div>
    );
  }

  if (asking)
    return (
      <div className={className}>
        <Panel slot="asking" title="Choose the tile" onClose={onClose} sub={<>{where} · the plans that fit, by members who hold one</>}>
          {plans === null ? (
            <p className="text-sm font-semibold text-muted-foreground">Looking for the plans that fit…</p>
          ) : plans.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">No plan fits this cell.</p>
          ) : (
            <>
              <ul aria-label="Plans that fit" className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto overscroll-contain p-0.5">
                {plans.map((p) => {
                  const on = chosen?.plan === p.plan;
                  return (
                    <li key={p.plan} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${tileName(p.plan)}, ${RARITY_NAME[p.rarity]}: ${p.holders === 0 ? "nobody holds one" : `${p.holders} ${p.holders === 1 ? "member holds" : "members hold"} one`}`}
                        disabled={busy !== null}
                        onClick={() => setPick({ x: cell.x, y: cell.y, plan: p.plan, turn: 0 })}
                        className={cn("drawer-carved flex size-full min-h-11 cursor-pointer flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center disabled:cursor-default", on && "shadow-[inset_0_0_0_2px_var(--primary)]", p.holders === 0 && "opacity-55")}
                      >
                        <ConquestTile plan={p.plan} renders={renders} className="size-12" />
                        <span className="text-sm leading-tight font-bold wrap-anywhere">{tileName(p.plan)}</span>
                        <span className={cn("text-xs font-semibold", on ? "text-primary" : "text-muted-foreground")}>
                          {p.holders === 0 ? (
                            "nobody"
                          ) : (
                            <>
                              <span className="numeric">{p.holders}</span> {p.holders === 1 ? "member" : "members"}
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {chosen ? (
                <div data-slot="conquest-chosen" className="drawer-carved flex items-center gap-3 rounded-2xl p-2">
                  <ConquestTile plan={chosen.plan} orientation={orientation} renders={renders} className="size-14 border-2 border-primary/70" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-outline text-base leading-tight font-bold">
                      {tileName(chosen.plan)} · {RARITY_NAME[chosen.rarity].toLowerCase()}
                      {pick!.turn % chosen.orientations.length > 0 && " · turned"}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {chosen.orientations.length > 1 ? `Fits ${chosen.orientations.length} ways.` : "Fits one way."} A request spends no order.
                    </span>
                  </div>
                  {chosen.orientations.length > 1 && (
                    <button type="button" aria-label="Turn" disabled={busy !== null} onClick={() => setPick({ ...pick!, turn: pick!.turn + 1 })} className="grid size-11 shrink-0 cursor-pointer place-items-center outline-none disabled:cursor-default">
                      <UiIcon name="tile-rotate" px={40} className="size-10" />
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-muted-foreground">Pick the tile to ask for.</p>
              )}
              <GoldButton className="w-full" disabled={chosen === null} busy={busy !== null} aria-label={chosen ? `Ask for ${tileName(chosen.plan)}` : "Ask"} onClick={() => chosen && onRequest?.({ x: cell.x, y: cell.y, plan: chosen.plan, orientation })}>
                Ask
              </GoldButton>
            </>
          )}
        </Panel>
      </div>
    );

  if (fog)
    return (
      <div className={className}>
        <Panel slot="explore" title="Explore" onClose={onClose} sub={cell.open ? <>{where} · nobody knows its Knowledge before</> : <>{where} · this zone is closed to your allegiance for now</>}>
          {cell.open && (
            <ul aria-label="The zone's odds" className="flex flex-wrap gap-1.5">
              {CONQUEST_ODDS[cell.province ? "province" : "free"].map((o) => (
                <li key={o.knowledge} className="rounded-full border border-border px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                  <span className="numeric text-foreground">{o.knowledge}</span> · <span className="numeric">{o.share}%</span>
                </li>
              ))}
            </ul>
          )}
          {cell.open && !canExplore && <p className="text-sm font-semibold text-muted-foreground">Your exploration of the day is made.</p>}
          <GoldButton className="w-full" disabled={!cell.open || !canExplore} busy={busy !== null} onClick={() => onExplore?.({ x: cell.x, y: cell.y })}>
            Explore
          </GoldButton>
        </Panel>
      </div>
    );

  if (cell?.tile)
    return (
      <p data-slot="conquest-action" data-panel="tile" className={cn("flex items-center gap-3 text-sm font-semibold text-muted-foreground", className)}>
        <ConquestTile plan={cell.tile.plan} orientation={cell.tile.orientation} renders={renders} className="size-11" />
        <span data-slot="conquest-tile-info">
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
        </span>
      </p>
    );

  return hint(
    cell
      ? leads
        ? "Explored. A tile goes next to one of yours: tap a marked cell to ask for one."
        : "Explored. An Officer or the Leader asks for the tiles."
      : canExplore
        ? leads
          ? "Tap a fog cell to explore it, a marked cell beside your tiles to ask for a tile, or a request to give its tile."
          : "Tap a fog cell to explore it, or a request to give its tile."
        : leads
          ? "Tap a marked cell beside your tiles to ask for a tile, or a request to give its tile."
          : "Your exploration of the day is made. Tap a request to give its tile.",
  );
}
