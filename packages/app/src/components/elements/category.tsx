import { CategoryType } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";
import { WorldIcon, type WorldIconName } from "./world-icon";
import { CATEGORY_NAMES, type CategoryName } from "./category-names";

/**
 * What a closing's category reads as, by the contracts' index (`CategoryType`, as `ScoredStructure.category` gives it). Its
 * icon is a game icon of the world (issue 870), in its own tones (`world-icon.tsx`): the City's is the castle (issue 862).
 */
type Glyph = WorldIconName;
type Category = CategoryName & { glyph: Glyph | null };
// The world icons' own names, drawn from their paths (#870): not Font Awesome's subset, so this table's line names no icon.
const GLYPHS: Partial<Record<CategoryType, Glyph>> = {
  [CategoryType.Forest]: "tree",
  [CategoryType.Road]: "road",
  [CategoryType.City]: "castle",
  [CategoryType.Wonder]: "landmark-dome",
};

/** A category the client does not know (none today): a flat star, muted. */
const UNKNOWN: Category = { label: "Structure", plural: "Structures", glyph: null };

export function categoryInfo(category: number): Category {
  const type = Object.values(CategoryType)[category];
  const name = CATEGORY_NAMES[type];
  return name ? { ...name, glyph: GLYPHS[type] ?? null } : UNKNOWN;
}

/** The categories a game closes, in the order the over screen lists them. */
export const CLOSING_CATEGORIES = [CategoryType.City, CategoryType.Road, CategoryType.Forest, CategoryType.Wonder].map((c) =>
  Object.values(CategoryType).indexOf(c),
);

/** A category's game icon, in its tones; 1.25em wide, as a fixed-width `Icon`, so a column of them lines up. */
export function CategoryIcon({ category, size = "md", className }: { category: number; size?: IconSize; className?: string }) {
  const { glyph } = categoryInfo(category);
  if (!glyph) return <Icon name="star" size={size} fixedWidth className={cn("text-muted-foreground", className)} />;
  return <WorldIcon name={glyph} size={size} className={className} />;
}
