import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Progress } from "../ui/progress";
import { ThemeCover, type TileRenders } from "../elements/tile-render";
import { PLANS } from "./cobble-types";

/** The five themes of the spec (A, "theme"); Default and Forest are out, the other three come later. */
export type ThemeId = "default" | "forest" | "snow" | "desert" | "volcano";

/** A theme whose tiles are sold one by one: every theme but Default (the base art, theme 0). */
export type SkinThemeId = Exclude<ThemeId, "default">;

export interface ThemeOption {
  id: ThemeId;
  name: string;
  /** One line under the name. */
  tagline: string;
  icon: string;
  /** False: "coming soon": no art yet, nothing to buy or use. */
  available: boolean;
}

/** The spec's five, in its order: Default (meadows) and Forest out, Snow, Desert and Volcano coming soon. */
export const THEMES: readonly ThemeOption[] = [
  { id: "default", name: "Default", tagline: "Meadows and stone cities", icon: "sun", available: true },
  { id: "forest", name: "Forest", tagline: "Deep woods: the extended tiles", icon: "tree", available: true },
  { id: "snow", name: "Snow", tagline: "Frozen fields", icon: "snowflake", available: false },
  { id: "desert", name: "Desert", tagline: "Dunes and oases", icon: "sun-plant-wilt", available: false },
  { id: "volcano", name: "Volcano", tagline: "Ash and lava", icon: "volcano", available: false },
];

/**
 * The `u8` theme ids of `skins` and `active_skins` (cobbles-v1.md 5: 0 is the default theme). Forest is theme 1, the
 * high-forest set the fresh deployment prices (CORE #463). Snow, Desert and Volcano have no id on chain yet: the client's
 * order is used meanwhile, and none of them is read (coming soon).
 */
export const THEME_CODES: Record<ThemeId, number> = { default: 0, forest: 1, snow: 2, desert: 3, volcano: 4 };

/** The theme of an `active_skins` entry. */
export const themeOfCode = (code: number): ThemeId | undefined => (Object.keys(THEME_CODES) as ThemeId[]).find((id) => THEME_CODES[id] === code);

/** The themes whose tiles are on sale and read: the available ones but Default. */
export const SKIN_THEMES: readonly ThemeOption[] = THEMES.filter((t) => t.available && t.id !== "default");

export interface ThemeCardProps {
  theme: ThemeOption;
  renders?: TileRenders;
  /** The plans owned in this theme (Default: all 19); null: not known (a guest, the read on its way). */
  owned: number | null;
  /** Every owned tile of the theme is active, and nothing else (`themeInUse`). */
  inUse?: boolean;
  /** Its `set_skins` is on its way. */
  applying?: boolean;
  /** Another write is on its way, or no player: Use waits. */
  disabled?: boolean;
  onUse?: () => void;
  /** To the theme's shop; unset for Default (nothing to buy). */
  onOpen?: () => void;
  className?: string;
}

/**
 * One theme: its cover (real tiles, rendered at build time), its name and line, the tiles owned of 19, and Use (every owned
 * tile of the theme at once) and Shop. A coming-soon theme shows a render under a strong blur and a lock, since its art
 * does not exist yet.
 */
export function ThemeCard({ theme, renders, owned, inUse, applying, disabled, onUse, onOpen, className }: ThemeCardProps) {
  const soon = !theme.available;
  const code = THEME_CODES[theme.id];
  const titleId = `theme-${theme.id}`;
  const none = owned === 0;
  return (
    <article aria-labelledby={titleId} className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", inUse ? "border-primary ring-1 ring-primary" : "border-border", className)}>
      <span className="relative block">
        {/* A coming-soon theme has no art: Default's render, blurred out of recognition, stands for it. */}
        <ThemeCover theme={soon ? 0 : code} renders={renders} blurred={soon} alt={`${theme.name}: a few of its tiles`} />
        {soon && (
          <span className="absolute inset-0 grid place-items-center bg-background/40">
            <Badge variant="secondary" className="gap-1.5">
              <Icon name="lock" size="xs" />
              Coming soon
            </Badge>
          </span>
        )}
        {inUse && (
          <Badge className="absolute top-2 left-2 gap-1">
            <Icon name="circle-check" size="xs" />
            In use
          </Badge>
        )}
      </span>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start gap-3">
          <Icon name={theme.icon} size="md" className={inUse ? "text-primary" : "text-muted-foreground"} fixedWidth />
          <div className="flex min-w-0 flex-1 flex-col wrap-anywhere">
            <h3 id={titleId} className="text-sm font-semibold">
              {theme.name}
            </h3>
            <p className="text-xs text-muted-foreground">{theme.tagline}</p>
          </div>
          {!soon && owned !== null && (
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              <span className="numeric font-semibold text-foreground">{owned}</span> / <span className="numeric">{PLANS}</span> tiles
            </span>
          )}
        </div>
        {!soon && owned !== null && code !== 0 && <Progress value={(owned / PLANS) * 100} aria-label={`${theme.name} tiles owned`} />}
        {!soon && (
          <div className="mt-auto flex gap-2">
            {onOpen && (
              <Button variant="outline" className="min-h-11 flex-1" onClick={onOpen} aria-label={`${theme.name} tiles`}>
                <Icon name="cubes-stacked" size="sm" />
                {none ? "Buy tiles" : "Tiles"}
              </Button>
            )}
            <Button
              className="min-h-11 flex-1"
              variant={inUse ? "secondary" : "default"}
              disabled={disabled || inUse || none || owned === null}
              loading={applying}
              onClick={onUse}
              aria-label={inUse ? `${theme.name} in use` : `Use ${theme.name}`}
            >
              {inUse ? "In use" : "Use"}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
