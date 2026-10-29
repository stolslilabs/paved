import { CategoryType } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";
import { WorldIcon, type WorldIconName } from "./world-icon";

/**
 * What a closing's category reads as, by the contracts' index (`CategoryType`, as `ScoredStructure.category` gives it). Its
 * icon is a game icon of the world (issue 870), in its own tones (`world-icon.tsx`): the City's is the castle (issue 862).
 */
type Category = { label: string; plural: string; glyph: WorldIconName | null };
const CATEGORIES: Partial<Record<CategoryType, Category>> = {
  [CategoryType.Forest]: { label: "Forest", plural: "Forests", glyph: "tree" },
  [CategoryType.Road]: { label: "Road", plural: "Roads", glyph: "road" },
  [CategoryType.City]: { label: "City", plural: "Cities", glyph: "castle" },
  [CategoryType.Wonder]: { label: "Wonder", plural: "Wonders", glyph: "landmark-dome" },
};

/** A category the client does not know (none today): a flat star, muted. */
const UNKNOWN: Category = { label: "Structure", plural: "Structures", glyph: null };

export function categoryInfo(category: number): Category {
  return CATEGORIES[Object.values(CategoryType)[category]] ?? UNKNOWN;
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
