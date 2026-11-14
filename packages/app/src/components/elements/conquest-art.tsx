import { cn } from "../../lib/utils";
import { conquestArtSources, type ConquestArtName } from "./play-art";
import { rankingArtSources } from "./ranking-art";
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
