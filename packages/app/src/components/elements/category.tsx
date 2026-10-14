import { CategoryType } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Icon, type IconSize } from "../ui/icon";

/** What a closing's category reads as, by the contracts' index (`CategoryType`, as `ScoredStructure.category` gives it). */
const CATEGORIES: Partial<Record<CategoryType, { label: string; plural: string; icon: string; color: string }>> = {
  [CategoryType.Forest]: { label: "Forest", plural: "Forests", icon: "tree", color: "text-meadow-400" },
  [CategoryType.Road]: { label: "Road", plural: "Roads", icon: "road", color: "text-gold-200" },
  [CategoryType.City]: { label: "City", plural: "Cities", icon: "city", color: "text-ink-200" },
  [CategoryType.Wonder]: { label: "Wonder", plural: "Wonders", icon: "landmark-dome", color: "text-river-300" },
};

const UNKNOWN = { label: "Structure", plural: "Structures", icon: "star" as string, color: "text-muted-foreground" };

export function categoryInfo(category: number) {
  return CATEGORIES[Object.values(CategoryType)[category]] ?? UNKNOWN;
}

/** The categories a game closes, in the order the over screen lists them. */
export const CLOSING_CATEGORIES = [CategoryType.City, CategoryType.Road, CategoryType.Forest, CategoryType.Wonder].map((c) =>
  Object.values(CategoryType).indexOf(c),
);

/** A category's icon in its colour. */
export function CategoryIcon({ category, size = "md", className }: { category: number; size?: IconSize; className?: string }) {
  const info = categoryInfo(category);
  return <Icon name={info.icon} size={size} className={cn(info.color, className)} />;
}
