import { cn } from "../../lib/utils";
import { conquestArtSources, type ConquestArtName } from "./play-art";
import { rankingArtSources } from "./ranking-art";
import { planCode } from "./tile-chip";
import { tileName, type TileRenders } from "./tile-render";
import { UiIcon } from "./ui-icon";

/** One of the Conquest's paintings (`CONQUEST_ART`, `play-art.ts`), `px` CSS pixels wide. Decorative: the words beside it name it. */
export function ConquestArt({ name, px, className }: { name: ConquestArtName; px: number; className?: string }) {
  return <img {...conquestArtSources(name, px)} alt="" aria-hidden draggable={false} decoding="async" className={cn("shrink-0 object-cover", className)} style={{ width: px, height: px }} />;
}

/** The Knowledge points' icon beside a figure: the open book, `px` wide. */
export function KnowledgeIcon({ px = 16, className }: { px?: number; className?: string }) {
  return <ConquestArt name="knowledge" px={px} className={className} />;
}

const ORDINALS = ["th", "st", "nd", "rd"] as const;
/** A place as words: 1st, 2nd, 3rd, 4th, 11th, 22nd. */
export function ordinal(place: number): string {
  const tens = place % 100;
  return `${place}${ORDINALS[tens >= 11 && tens <= 13 ? 0 : Math.min(place % 10, 4) % 4]}`;
}

/** A place's mark in a list: the podium's medal (gold, silver, bronze), else the place's number. Read by its place either way. */
export function PlaceMark({ place, px = 28, className }: { place: number; px?: number; className?: string }) {
  return (
    <span role="img" aria-label={ordinal(place)} data-place={place} className={cn("grid shrink-0 place-items-center", className)} style={{ width: px, height: px }}>
      {place === 1 || place === 2 ? (
        <img {...rankingArtSources(place === 1 ? "medal-gold" : "medal-silver", px)} alt="" draggable={false} decoding="async" style={{ width: px, height: px }} />
      ) : place === 3 ? (
        <UiIcon name="medal" px={px} />
      ) : (
        <span className="numeric text-base font-bold text-muted-foreground">{place}</span>
      )}
    </span>
  );
}

/**
 * A tile as the board draws it, seen from above and turned to its orientation: its build-time voxel render (`TileRender`, the
 * manifest's `<plan>-top`). The Conquest shows no other picture of a tile.
 */
export function ConquestTile({ plan, orientation = 1, renders, className }: { plan: number; orientation?: number; renders?: TileRenders; className?: string }) {
  const src = renders?.(0, `${planCode(plan).toLowerCase()}-top`) ?? null;
  return (
    // Without its render (the manifest still on its way) the tile is a plain slab with its name: never the plan's simplified drawing.
    <span data-slot="conquest-tile" data-render={src ? "voxel" : "none"} role={src ? undefined : "img"} aria-label={src ? undefined : tileName(plan)} className={cn("block shrink-0 overflow-hidden rounded-lg bg-secondary", className)}>
      {src && <img src={src} alt={tileName(plan)} loading="lazy" decoding="async" draggable={false} className="block size-full object-cover transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `rotate(${(orientation - 1) * 90}deg)` }} />}
    </span>
  );
}
