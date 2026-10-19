import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";

/** A skin a plan can wear: a theme the player owns it in (Default always). */
export interface SkinOption {
  /** The theme's `u8` id (0 the default). */
  code: number;
  name: string;
}

export interface TileSkinPickerProps {
  plan: number;
  /** Default first, then each theme the player owns this plan in. */
  options: readonly SkinOption[];
  /** The theme the plan wears with the unsaved batch applied. */
  value: number;
  /** The theme saved on chain: a different `value` is marked unsaved. */
  saved: number;
  renders?: TileRenders;
  disabled?: boolean;
  onPick?: (plan: number, code: number) => void;
  className?: string;
}

/**
 * One plan of My tiles: its name and its skins as a single choice (arrow keys move it), each the tile's real render in that
 * theme. A plan owned in no theme has Default alone, shown as such.
 */
export function TileSkinPicker({ plan, options, value, saved, renders, disabled, onPick, className }: TileSkinPickerProps) {
  const name = tileName(plan);
  const changed = value !== saved;
  return (
    <li aria-label={name} data-changed={changed || undefined} className={cn("flex flex-col gap-2 rounded-xl border bg-card p-2", changed ? "border-gold-800" : "border-border", className)}>
      <span className="flex items-center justify-between gap-2 px-1">
        <span className="text-sm font-semibold">{name}</span>
        {changed && (
          <Badge variant="outline" className="border-gold-800">
            Unsaved
          </Badge>
        )}
      </span>
      <ToggleGroup
        type="single"
        value={String(value)}
        disabled={disabled}
        onValueChange={(v) => v !== "" && onPick?.(plan, Number(v))}
        aria-label={`${name} skin`}
        className="flex w-full flex-wrap justify-start gap-2"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.code}
            value={String(o.code)}
            aria-label={`${name}: ${o.name}`}
            className="flex h-auto min-h-11 w-24 flex-col gap-1 rounded-lg! border border-border p-1 data-[state=on]:border-primary data-[state=on]:ring-1 data-[state=on]:ring-primary"
          >
            <span className="block aspect-square w-full overflow-hidden rounded-md bg-board">
              <TileRender plan={plan} theme={o.code} renders={renders} alt="" />
            </span>
            <span className="text-xs">{o.name}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </li>
  );
}
