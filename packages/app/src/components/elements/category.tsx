import { CategoryType } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Glyph, type GlyphName } from "./glyph";

/** What a closing's category reads as, by the contracts' index (`CategoryType`, as `ScoredStructure.category` gives it). */
const CATEGORIES: Partial<Record<CategoryType, { label: string; plural: string; glyph: GlyphName; color: string }>> = {
  [CategoryType.Forest]: { label: "Forest", plural: "Forests", glyph: "forest", color: "text-meadow-400" },
  [CategoryType.Road]: { label: "Road", plural: "Roads", glyph: "road", color: "text-gold-200" },
  [CategoryType.City]: { label: "City", plural: "Cities", glyph: "city", color: "text-ink-200" },
  [CategoryType.Wonder]: { label: "Wonder", plural: "Wonders", glyph: "wonder", color: "text-river-300" },
};

const UNKNOWN = { label: "Structure", plural: "Structures", glyph: "star" as GlyphName, color: "text-muted-foreground" };

export function categoryInfo(category: number) {
  return CATEGORIES[Object.values(CategoryType)[category]] ?? UNKNOWN;
}

/** The categories a game closes, in the order the over screen lists them. */
export const CLOSING_CATEGORIES = [CategoryType.City, CategoryType.Road, CategoryType.Forest, CategoryType.Wonder].map((c) =>
  Object.values(CategoryType).indexOf(c),
);

/** A category's glyph in its colour. */
export function CategoryGlyph({ category, className }: { category: number; className?: string }) {
  const info = categoryInfo(category);
  return <Glyph name={info.glyph} className={cn(info.color, className)} />;
}
