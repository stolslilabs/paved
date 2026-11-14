import { useState } from "react";
import { formatInteger } from "@paved/game-core";
import type { ConquestOptions, ConquestRequestState, ConquestZoneState, ConquestZoneSummary } from "../../data/conquest-source";
import { cn } from "../../lib/utils";
import { ConquestCellAction } from "./conquest-cell";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";

/** The cells a side of the window on a zone: a zone is 25 cells a side, shown eight at a time so that a cell keeps the 44 px touch floor. */
const WINDOW = 8;
/** The cells an arrow moves the window by. */
const STEP = 4;

const zoneLabel = (zone: ConquestZoneSummary): string => (zone.mine ? "your province" : zone.guild ? `the province of ${zone.guild.name}` : zone.province ? "an empty province" : "a free zone");

export interface ConquestWorldProps {
  /** The world's side in zones. */
  side: number;
  zones: readonly ConquestZoneSummary[];
  /** The zone shown; null: none. */
  selected?: number | null;
  onZone?: (zone: number) => void;
  className?: string;
}

/**
 * The Conquest's world (the season's finale): the checkerboard of its zones, the north at the top. A province wears its allegiance's
 * initial (the viewer's own in blue, a rival's in red, each named), a free zone its Great Wonder; a zone closed to the viewer's
 * allegiance is dimmed. A tap opens the zone.
 */
export function ConquestWorld({ side, zones, selected = null, onZone, className }: ConquestWorldProps) {
  const rows: ConquestZoneSummary[][] = [];
  for (let row = side - 1; row >= 0; row--) rows.push(zones.filter((z) => z.row === row).sort((a, b) => a.col - b.col));
  return (
    <div role="group" aria-label="The world" data-slot="conquest-world" className={cn("drawer-carved grid gap-1 rounded-2xl p-2", className)} style={{ gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))` }}>
      {rows.flat().map((zone) => (
        <button
          key={zone.index}
          type="button"
          aria-pressed={zone.index === selected}
          aria-label={`${zone.name}: ${zoneLabel(zone)}${zone.open ? ", open" : ", closed"}${zone.tiles > 0 ? `, ${formatInteger(zone.tiles)} ${zone.tiles === 1 ? "tile" : "tiles"}` : ""}`}
          data-mine={zone.mine || undefined}
          data-open={zone.open || undefined}
          onClick={() => onZone?.(zone.index)}
          className={cn(
            "state-layer flex aspect-square min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 text-xs font-bold",
            zone.mine ? "border-info bg-info/20 text-info" : zone.guild ? "border-joust-rival/70 bg-joust-rival-fill/20 text-joust-rival" : zone.province ? "border-border bg-background/40 text-muted-foreground" : "border-dashed border-border bg-background/70 text-primary",
            !zone.open && !zone.mine && "opacity-70",
            zone.index === selected && "ring-2 ring-primary",
          )}
        >
          {zone.province ? <span className="text-sm leading-none">{zone.guild ? zone.guild.name.replace(/^The /, "").slice(0, 2) : "·"}</span> : <UiIcon name="wonder" px={20} className="size-5" />}
          {zone.tiles > 0 && <span className="numeric text-[0.75rem] leading-none text-foreground/90">{formatInteger(zone.tiles)}</span>}
        </button>
      ))}
    </div>
  );
}

export interface ConquestZoneMapProps {
  zone: ConquestZoneState;
  /** The viewer leads their allegiance (an Officer or the Leader): they open the requests. */
  leads: boolean;
  /** The orders the allegiance has left today. */
  orders: number;
  /** The cell picked; null: none. */
  cell: { x: number; y: number } | null;
  onCell?: (cell: { x: number; y: number } | null) => void;
  /** What fits the picked cell; null while it is read (or with no cell picked). */
  options: ConquestOptions | null;
  /** The write on its way: its button waits. */
  busy?: "explore" | "request" | "give" | null;
  onExplore?: (cell: { x: number; y: number }) => void;
  onRequest?: (tile: { x: number; y: number; plan: number; orientation: number }) => void;
  onGive?: (request: number) => void;
  tileArt?: TileArt;
  className?: string;
}

/** The window's first cell on an axis so that `at` is inside it. */
const windowOn = (at: number, size: number): number => Math.max(0, Math.min(size - WINDOW, Math.round((at - WINDOW / 2 + 0.5) / STEP) * STEP));

/**
 * One zone of the Conquest's world, eight cells by eight at a time (the arrows move the window; the small map shows where it is). A
 * tile wears its allegiance's colour (the viewer's in blue, a rival's in red; a wonder none); an explored cell is light, the fog dark.
 * A tap on a fog cell offers the day's exploration, with the zone's odds; for an Officer or the Leader a tap on a cell beside the
 * allegiance's tiles lists the plans that fit, by the members who hold one, and asks for one; a cell with a request shows the tile
 * wanted, and Give builds it from the viewer's own tiles.
 */
export function ConquestZoneMap({ zone, leads, orders, cell, onCell, options, busy = null, onExplore, onRequest, onGive, tileArt, className }: ConquestZoneMapProps) {
  // The window opens on the cell picked, else on the capital (a free zone's Great Wonder), else on the zone's middle.
  const centre = cell ?? zone.tiles.find((t) => t.kind === "capital" || t.kind === "great") ?? { x: zone.x0 + (zone.size - 1) / 2, y: zone.y0 + (zone.size - 1) / 2 };
  const [origin, setOrigin] = useState(() => ({ x: windowOn(centre.x - zone.x0, zone.size), y: windowOn(centre.y - zone.y0, zone.size) }));
  // The tile the action draws on the picked cell: the plan picked for a request, in its turn.
  const [preview, setPreview] = useState<{ x: number; y: number; plan: number; orientation: number } | null>(null);
  const key = (x: number, y: number) => `${x},${y}`;
  const tiles = new Map(zone.tiles.map((t) => [key(t.x, t.y), t]));
  const explored = new Set(zone.explored.map((c) => key(c.x, c.y)));
  const frontier = new Set(zone.frontier.map((c) => key(c.x, c.y)));
  const requests = new Map<string, ConquestRequestState>(zone.requests.map((r) => [key(r.x, r.y), r]));
  const cells: { x: number; y: number }[] = [];
  for (let y = origin.y + WINDOW - 1; y >= origin.y; y--) for (let x = origin.x; x < origin.x + WINDOW; x++) cells.push({ x: zone.x0 + x, y: zone.y0 + y });
  const picked = cell ? key(cell.x, cell.y) : null;
  const request = picked ? (requests.get(picked) ?? null) : null;
  const move = (dx: number, dy: number) => setOrigin((o) => ({ x: Math.max(0, Math.min(zone.size - WINDOW, o.x + dx * STEP)), y: Math.max(0, Math.min(zone.size - WINDOW, o.y + dy * STEP)) }));
  const name = (x: number, y: number) => `row ${zone.y0 + zone.size - y}, column ${x - zone.x0 + 1}`;
  const arrows = [
    { label: "West", turn: "rotate-180", dx: -1, dy: 0, off: origin.x === 0 },
    { label: "South", turn: "rotate-90", dx: 0, dy: -1, off: origin.y === 0 },
    { label: "North", turn: "-rotate-90", dx: 0, dy: 1, off: origin.y === zone.size - WINDOW },
    { label: "East", turn: "", dx: 1, dy: 0, off: origin.x === zone.size - WINDOW },
  ] as const;
  return (
    <div data-slot="conquest-zone" className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Move the map" className="flex flex-1 gap-1.5">
          {arrows.map((a) => (
            <Button key={a.label} variant="secondary" className="h-11 min-w-11 flex-1 px-0" disabled={a.off} aria-label={`Move ${a.label.toLowerCase()}`} onClick={() => move(a.dx, a.dy)}>
              <Icon name="chevron-right" size="sm" className={a.turn} />
            </Button>
          ))}
        </div>
        {/* Where the window is in the zone: one dot per tile, the window framed. */}
        <svg role="img" aria-label={`The window shows columns ${origin.x + 1} to ${origin.x + WINDOW}, rows ${zone.size - origin.y - WINDOW + 1} to ${zone.size - origin.y}`} viewBox={`0 0 ${zone.size} ${zone.size}`} className="size-11 shrink-0 rounded-md bg-background/70 text-muted-foreground">
          {zone.explored.map((c) => (
            <rect key={key(c.x, c.y)} x={c.x - zone.x0} y={zone.size - 1 - (c.y - zone.y0)} width="1" height="1" fill="currentColor" opacity="0.35" />
          ))}
          {zone.tiles.map((t) => (
            <rect key={key(t.x, t.y)} x={t.x - zone.x0} y={zone.size - 1 - (t.y - zone.y0)} width="1" height="1" className={t.mine ? "text-info" : t.guild ? "text-joust-rival" : "text-primary"} fill="currentColor" />
          ))}
          <rect x={origin.x} y={zone.size - origin.y - WINDOW} width={WINDOW} height={WINDOW} fill="none" stroke="currentColor" strokeWidth="1" className="text-foreground" />
        </svg>
      </div>

      <div className="drawer-carved overflow-hidden rounded-xl">
        <ScrollRegion orientation="horizontal" data-slot="conquest-cells">
          <div role="grid" aria-label={`Zone ${zone.zone.name}, ${zoneLabel(zone.zone)}`} className="grid min-w-92 grid-cols-8 gap-px p-1">
            {cells.map(({ x, y }) => {
              const k = key(x, y);
              const tile = tiles.get(k);
              const here = picked === k;
              // A capital's crown, a wonder's mark.
              const mark = !tile || tile.kind === "tile" ? null : tile.kind === "capital" ? "crown" : "wonder";
              if (tile)
                return (
                  <span
                    key={k}
                    role="gridcell"
                    aria-label={`${name(x, y)}: ${tile.kind === "capital" ? (tile.mine ? "your capital" : `the capital of ${tile.guild?.name}`) : tile.kind === "great" ? "a Great Wonder" : tile.kind === "wonder" ? "a wonder" : `${tileName(tile.plan)}, ${tile.mine ? "your allegiance's" : `of ${tile.guild?.name}`}${tile.by ? `, given by ${tile.by}` : ""}`}`}
                    data-kind={tile.kind}
                    data-mine={tile.mine || undefined}
                    className="relative aspect-square"
                  >
                    <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} className="size-full rounded-sm border-0" />
                    {tile.guild && <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-sm border-2", tile.mine ? "border-info" : "border-joust-rival")} />}
                    {mark && <UiIcon name={mark} px={16} className="pointer-events-none absolute top-0.5 left-0.5 size-4" />}
                  </span>
                );
              const wanted = requests.get(k);
              const light = explored.has(k);
              const open = frontier.has(k) && leads;
              const tappable = wanted !== undefined || open || (!light && zone.canExplore);
              const label = wanted ? `a request for ${tileName(wanted.plan)}` : open ? "explored, beside your tiles" : light ? "explored" : "fog";
              if (!tappable) return <span key={k} role="gridcell" aria-label={`${name(x, y)}: ${label}`} data-explored={light || undefined} className={cn("aspect-square rounded-sm", light ? "bg-foreground/15" : "bg-background/80")} />;
              return (
                <button
                  key={k}
                  type="button"
                  role="gridcell"
                  aria-pressed={here}
                  aria-label={`${name(x, y)}: ${label}`}
                  data-touch-floor
                  data-explored={light || undefined}
                  data-request={wanted ? wanted.id : undefined}
                  disabled={busy !== null}
                  onClick={() => onCell?.(here ? null : { x, y })}
                  className={cn(
                    "relative flex aspect-square cursor-pointer items-center justify-center rounded-sm disabled:cursor-default",
                    light ? "bg-foreground/15" : "bg-background/80",
                    wanted ? "border-2 border-primary" : open ? "border-2 border-dashed border-primary/70" : "",
                    here && "border-2 border-solid border-foreground",
                  )}
                >
                  {wanted ? (
                    <TileChip plan={wanted.plan} orientation={wanted.orientation} art={tileArt} className="size-full rounded-none border-0 opacity-60" />
                  ) : here && preview && preview.x === x && preview.y === y ? (
                    <TileChip plan={preview.plan} orientation={preview.orientation} art={tileArt} className="size-full rounded-none border-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </ScrollRegion>
      </div>

      <ConquestCellAction
        cell={cell ? { ...cell, tile: tiles.get(picked!) ?? null, request, explored: explored.has(picked!), frontier: frontier.has(picked!), province: zone.zone.province, open: zone.zone.open } : null}
        leads={leads}
        orders={orders}
        canExplore={zone.canExplore}
        options={options}
        busy={busy}
        onExplore={onExplore}
        onRequest={onRequest}
        onGive={onGive}
        onPreview={setPreview}
        tileArt={tileArt}
      />
    </div>
  );
}
