import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icon";
import { TileChip, type TileArt } from "../elements/tile-chip";

/** The five themes of the spec (A, "theme"); Default and Forest are playable, the other three come later. */
export type ThemeId = "default" | "forest" | "snow" | "desert" | "volcano";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  /** One line under the name. */
  tagline: string;
  icon: string;
  /** False: "coming soon", not selectable. */
  available: boolean;
}

/** The spec's five, in its order: Default (meadows) and Forest selectable, Snow, Desert and Volcano coming soon. */
export const THEMES: readonly ThemeOption[] = [
  { id: "default", name: "Default", tagline: "Meadows and stone cities", icon: "sun", available: true },
  { id: "forest", name: "Forest", tagline: "Deep woods: the extended tiles", icon: "tree", available: true },
  { id: "snow", name: "Snow", tagline: "Frozen fields", icon: "snowflake", available: false },
  { id: "desert", name: "Desert", tagline: "Dunes and oases", icon: "sun-plant-wilt", available: false },
  { id: "volcano", name: "Volcano", tagline: "Ash and lava", icon: "volcano", available: false },
];

/**
 * How a theme's preview tints the base tiles' art until its own art exists (Forest is Q4's extended tiles, the other three
 * have none yet): a sketch of the mood, said so on the card, never the theme's real art.
 */
export const THEME_TINT: Record<ThemeId, string | undefined> = {
  default: undefined,
  forest: "saturate(1.35) hue-rotate(-18deg) brightness(0.78)",
  snow: "grayscale(0.7) brightness(1.45) contrast(0.9)",
  desert: "sepia(0.85) saturate(1.5) brightness(1.05)",
  volcano: "sepia(0.7) hue-rotate(-35deg) saturate(2.2) brightness(0.6)",
};

export interface ThemeCardProps {
  theme: ThemeOption;
  selected: boolean;
  /** Eighteen tiles of a recorded board (six by three), drawn with the theme's look. */
  tiles: readonly { plan: number; orientation: number }[];
  /** The tiles' images (`useTileArt`); the plans' areas without it. */
  tileArt?: TileArt;
  onSelect?: (id: ThemeId) => void;
  className?: string;
}

/**
 * One theme: a preview of its tiles, its name and line, selected with a gold ring and a check; locked when not out yet. A
 * tinted preview (every theme but Default) carries a "Preview" label on the card.
 */
export function ThemeCard({ theme, selected, tiles, tileArt, onSelect, className }: ThemeCardProps) {
  const soon = !theme.available;
  // A tinted sketch, never the theme's art: labelled on its own card (PM, 2026-10-14), so nobody takes it for final art.
  const tinted = THEME_TINT[theme.id] !== undefined;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${theme.name}${soon ? ", coming soon" : ""}`}
      disabled={soon}
      onClick={() => onSelect?.(theme.id)}
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-gold-800",
        className,
      )}
    >
      <span className="relative block aspect-[2/1] overflow-hidden bg-secondary">
        <span className="absolute inset-0 grid grid-cols-6 gap-0.5 p-0.5" style={{ filter: THEME_TINT[theme.id] }}>
          {tiles.slice(0, 18).map((t, i) => (
            <TileChip key={i} plan={t.plan} orientation={t.orientation} art={tileArt} size="sm" className="size-full rounded-sm border-0" />
          ))}
        </span>
        {soon && (
          <span className="absolute inset-0 grid place-items-center bg-background/55 backdrop-blur-[1px]">
            <Badge variant="secondary" className="gap-1.5">
              <Icon name="lock" size="xs" />
              Coming soon
            </Badge>
          </span>
        )}
        {tinted && (
          <Badge variant="outline" data-testid="preview-label" className="absolute top-1.5 left-1.5 z-10 border-gold-700 bg-background/80 text-gold-200 backdrop-blur-sm">
            <Icon name="eye" size="xs" />
            Preview
          </Badge>
        )}
      </span>
      <span className="flex items-start gap-3 p-3">
        <Icon name={theme.icon} size="md" className={selected ? "text-primary" : "text-muted-foreground"} fixedWidth />
        <span className="flex min-w-0 flex-1 flex-col wrap-anywhere">
          <span className="text-sm font-semibold">{theme.name}</span>
          <span className="text-xs text-muted-foreground">{theme.tagline}</span>
        </span>
        {selected ? <Icon name="circle-check" size="md" className="text-primary" label="Selected" /> : soon ? <Icon name="lock" size="sm" className="text-muted-foreground" /> : null}
      </span>
    </button>
  );
}
