import type { ReactNode } from "react";
import { CONQUEST_PROVINCE, formatInteger } from "@paved/game-core";
import type { ConquestAreaState, ConquestOptions, ConquestState, ConquestZoneState, ConquestZoneSummary } from "../../data/conquest-source";
import { cn } from "../../lib/utils";
import { ConquestCellAction, type ConquestCellInfo } from "../containers/conquest-cell";
import { ConquestWorld, ConquestZoneMap } from "../containers/conquest-map";
import { TopBar } from "../containers/top-bar";
import { ConquestArt } from "../elements/conquest-art";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { modeIconSources } from "../elements/play-art";
import { Notice } from "../elements/notice";
import type { TileArt } from "../elements/tile-chip";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

export interface ConquestMapSceneProps {
  /** The Conquest as the viewer sees it; null while it is read. */
  state: ConquestState | null;
  /** The world round the zone in view; null while it is read. */
  area: ConquestAreaState | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /**
   * The 3D board (the page's `BoardCanvas` on the area's tiles). Without it (no WebGL, the renderer could not start) the scene draws
   * the zone as a grid, eight cells by eight (`zone`).
   */
  canvas?: ReactNode;
  /** The zone's own read, for the grid without the 3D board; null while it is read. */
  zone?: ConquestZoneState | null;
  /** The zone under the middle of the view: the scene's title, and whether Back to my zone shows. */
  focus: number | null;
  /** The cell picked, and what fits it. */
  cell?: { x: number; y: number } | null;
  options?: ConquestOptions | null;
  busy?: "explore" | "request" | "give" | null;
  /** What the last act did, in two lines. */
  notice?: { title: string; text: string } | null;
  /** The world's grid is open. */
  world?: boolean;
  tileArt?: TileArt;
  onBack?: () => void;
  onWorld?: (open: boolean) => void;
  /** A zone picked on the world's grid: its scene is loaded. */
  onZone?: (zone: number) => void;
  /** Back to the viewer's own zone. */
  onHome?: () => void;
  onCell?: (cell: { x: number; y: number } | null) => void;
  onExplore?: (cell: { x: number; y: number }) => void;
  onRequest?: (tile: { x: number; y: number; plan: number; orientation: number }) => void;
  onGive?: (request: number) => void;
  /** The tile the picked cell previews (the board draws it there). */
  onPreview?: (tile: { x: number; y: number; plan: number; orientation: number } | null) => void;
}

const zoneWords = (zone: ConquestZoneSummary): string => (zone.mine ? "your province" : zone.guild ? `the province of ${zone.guild.name}` : zone.province ? "an empty province" : "a free zone");

/** A round button of the scene's side column: a painted icon over its word, as the home's. */
function SideButton({ art, word, name, onAct }: { art: ReactNode; word: string; name: string; onAct?: () => void }) {
  return (
    <button type="button" onClick={onAct} aria-label={name} data-slot="conquest-side-button" className="pointer-events-auto relative grid size-16 shrink-0 cursor-pointer place-items-center rounded-2xl bg-card/80 outline-none backdrop-blur">
      <span aria-hidden className="flex flex-col items-center">
        {art}
        <span className="text-outline -mt-0.5 text-xs leading-none font-black tracking-tight">{word}</span>
      </span>
    </button>
  );
}

function Chip({ art, children }: { art: "hammer" | "explore" | "pin"; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-card/85 px-2.5 py-1 text-xs font-bold backdrop-blur">
      <UiIcon name={art} px={18} className="size-4.5" />
      {children}
    </span>
  );
}

/**
 * The Conquest's map (`/conquest`, the season's finale): the board's scene on the world round a zone. It opens on the viewer's own
 * province; a pan toward an edge shows the zones beyond, and the scene names the zone under the middle of the view. At its side, the
 * World button opens the grid of the zones (a tap loads that zone's scene) and, once the view is on another zone, Back to my zone
 * returns home. Over the board: the day's orders, exploration and requests; at its foot, what the picked cell offers and its one
 * action (explore a fog cell, ask for a tile beside the allegiance's, give a request's tile). Without the 3D board, the zone as a grid.
 */
export function ConquestMapScene({ state, area, error, errorDetail, onRetry, canvas, zone = null, focus, cell = null, options = null, busy = null, notice = null, world = false, tileArt, onBack, onWorld, onZone, onHome, onCell, onExplore, onRequest, onGive, onPreview }: ConquestMapSceneProps) {
  const shown = state && focus !== null ? (state.zones[focus] ?? null) : null;
  const title = shown ? (shown.mine ? "My province" : `Zone ${shown.name}`) : "Map";
  if (error || !state || state.side === 0)
    return (
      <div className="flex min-h-dvh flex-col bg-board text-foreground">
        <TopBar title="Map" onBack={onBack} balances={false} />
        <main aria-busy={!error && !state} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4">
          {error ? (
            <InlineError
              title="The map"
              message={error}
              detail={errorDetail}
              action={
                onRetry && (
                  <Button size="sm" variant="secondary" onClick={onRetry}>
                    Try again
                  </Button>
                )
              }
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">{state ? "The world is drawn when day 1 begins." : "Reading the world…"}</p>
          )}
        </main>
      </div>
    );
  const mine = state.allegiance;
  const me = state.me;
  const playDay = state.day >= 1 && !state.rest && state.phase !== "results";
  const canExplore = !!me && playDay && !me.exploredToday;
  const away = state.home !== null && focus !== null && focus !== state.home;
  // The picked cell as the allegiance meets it, from the area in view.
  let info: ConquestCellInfo | null = null;
  if (cell && area) {
    const at = (c: { x: number; y: number }) => c.x === cell.x && c.y === cell.y;
    const z = state.zones[Math.floor(cell.y / CONQUEST_PROVINCE) * state.side + Math.floor(cell.x / CONQUEST_PROVINCE)];
    info = { ...cell, tile: area.tiles.find(at) ?? null, request: area.requests.find(at) ?? null, explored: area.explored.some(at), frontier: area.frontier.some(at), province: z?.province ?? true, open: z?.open ?? false };
  }
  const chips = (
    <div data-slot="conquest-map-chips" className="flex flex-wrap gap-1.5">
      {mine && (
        <Chip art="hammer">
          <span>
            <span className="numeric">{mine.orders.left}</span> {mine.orders.left === 1 ? "order" : "orders"}
          </span>
        </Chip>
      )}
      {me && (
        <Chip art="explore">
          <span>
            <span className="numeric">{canExplore ? 1 : 0}</span> exploration
          </span>
        </Chip>
      )}
      {mine && (
        <Chip art="pin">
          <span>
            <span className="numeric">{state.requests.length}</span> {state.requests.length === 1 ? "request" : "requests"}
          </span>
        </Chip>
      )}
    </div>
  );
  const side = (
    <div data-slot="conquest-map-side" className="flex flex-col gap-2">
      <SideButton art={<ConquestArt name="world" px={36} />} word="World" name="World: the grid of the zones" onAct={() => onWorld?.(true)} />
      {away && <SideButton art={<img {...modeIconSources("conquest", 36)} alt="" draggable={false} decoding="async" className="size-9" />} word="Home" name="Back to my zone" onAct={onHome} />}
    </div>
  );
  const action = (
    <>
      {notice && (
        <Notice tone="info" title={notice.title}>
          <span data-slot="conquest-notice">{notice.text}</span>
        </Notice>
      )}
      {!canvas && shown === null ? null : canvas ? <ConquestCellAction cell={info} leads={state.leads} orders={mine?.orders.left ?? 0} canExplore={canExplore} options={options} busy={busy} onExplore={onExplore} onRequest={onRequest} onGive={onGive} onPreview={onPreview} tileArt={tileArt} /> : null}
    </>
  );
  const grid = (
    <Dialog open={world} onOpenChange={(open) => onWorld?.(open)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>World {state.world}</DialogTitle>
          <DialogDescription>
            {formatInteger(state.registered.length)} allegiances, a province each; a Great Wonder in every free zone. Tap a zone to open its map.
          </DialogDescription>
        </DialogHeader>
        <ConquestWorld side={state.side} zones={state.zones} selected={focus} onZone={onZone} />
      </DialogContent>
    </Dialog>
  );

  if (!canvas)
    return (
      <div data-slot="conquest-map" data-view="grid" className="flex min-h-dvh flex-col bg-board text-foreground">
        <TopBar title={title} onBack={onBack} />
        <main aria-busy={zone === null} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-2">
              {shown && (
                <p data-slot="conquest-zone-head" className="text-sm font-semibold text-muted-foreground">
                  <strong className="text-foreground">{shown.name}</strong> · {zoneWords(shown)}
                </p>
              )}
              {chips}
            </div>
            {side}
          </div>
          {action}
          {zone ? <ConquestZoneMap zone={zone} leads={state.leads} orders={mine?.orders.left ?? 0} cell={cell} onCell={onCell} options={options} busy={busy} onExplore={onExplore} onRequest={onRequest} onGive={onGive} tileArt={tileArt} /> : <p className="text-center text-sm text-muted-foreground">Reading the zone…</p>}
        </main>
        {grid}
      </div>
    );
  return (
    <div data-slot="conquest-map" data-view="board" className="relative h-dvh min-h-[32rem] overflow-hidden bg-board text-foreground">
      {canvas}
      {/* The overlays let the gestures through to the board; their controls take them back. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <div className="pointer-events-auto">
          <TopBar title={title} onBack={onBack} className="mb-0" />
        </div>
        <div className="flex items-start justify-between gap-2 px-3 pt-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            {shown && (
              <p data-slot="conquest-zone-head" className="text-outline text-sm font-bold">
                {shown.name} · {zoneWords(shown)}
                {!shown.open && " · closed"}
              </p>
            )}
            {chips}
          </div>
          {side}
        </div>
        <div className={cn("pointer-events-auto mt-auto flex flex-col gap-2 rounded-t-2xl bg-card/95 px-4 pt-3 backdrop-blur", "pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>{action}</div>
      </div>
      {grid}
    </div>
  );
}
