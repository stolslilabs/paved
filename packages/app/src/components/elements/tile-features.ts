import { AreaType, Base, CategoryType, DirectionType, Plan, PlanType, SpotType } from "@paved/game-core";

/**
 * What a tile holds (COLLECTION-PAGE's Description, the owner's ask of 2026-11-05), read from its plan alone (`@paved/game-core`, the
 * contracts' layouts): its areas (`Plan.area`, one per city, road, forest or wonder on it), the sides each opens onto (its spots'
 * `moves`), the crossroads at its centre (a `Stop`), and its copies in the base deck (`Base`). Nothing that the plan does not say.
 */
export interface TileFeatures {
  cities: number;
  roads: number;
  forests: number;
  wonders: number;
  /** Copies of the plan in the base deck (`Base`, 72 tiles). */
  deck: number;
  /** One sentence for the player: what is on the tile and how far each city and road reaches. */
  sentence: string;
}

/** The nine spots in the plan's letters' order: the centre, then the corners and the edges clockwise from the north-west. */
const SPOTS: readonly SpotType[] = [
  SpotType.Center,
  SpotType.NorthWest,
  SpotType.North,
  SpotType.NorthEast,
  SpotType.East,
  SpotType.SouthEast,
  SpotType.South,
  SpotType.SouthWest,
  SpotType.West,
];
/** The four sides a structure can leave the tile by. */
const SIDES: ReadonlySet<DirectionType> = new Set([DirectionType.North, DirectionType.East, DirectionType.South, DirectionType.West]);

const WORDS = ["no", "one", "two", "three", "four"] as const;
const word = (n: number): string => WORDS[n] ?? String(n);
/** "a forest", "two forests". */
const some = (n: number, one: string, many: string): string => (n === 1 ? `a ${one}` : `${word(n)} ${many}`);
/** "a, b and c". */
const list = (parts: readonly string[]): string => (parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

/** The base deck's copies of each plan, counted once. */
let deckCounts: Map<PlanType, number> | null = null;
function deckCount(type: PlanType): number {
  if (!deckCounts) {
    deckCounts = new Map();
    for (let i = 0; i < Base.count(); i++) {
      const p = Base.plan(i);
      deckCounts.set(p, (deckCounts.get(p) ?? 0) + 1);
    }
  }
  return deckCounts.get(type) ?? 0;
}

/** The features of a chain plan id (1 to 19); a plan with none (0) holds nothing. */
export function tileFeatures(planId: number): TileFeatures {
  const plan = Plan.from(planId);
  if (!plan.value || plan.value === PlanType.None) return { cities: 0, roads: 0, forests: 0, wonders: 0, deck: 0, sentence: "" };
  const categories = plan.unpack().map((c) => c.value);
  // Each area: its category and the sides it opens onto.
  const areas = new Map<AreaType, { category: CategoryType; sides: Set<DirectionType> }>();
  SPOTS.forEach((spot, i) => {
    const area = plan.area(spot);
    if (area === AreaType.None) return;
    const entry = areas.get(area) ?? { category: categories[i] ?? CategoryType.None, sides: new Set<DirectionType>() };
    for (const move of plan.moves(spot)) if (SIDES.has(move.direction.value)) entry.sides.add(move.direction.value);
    areas.set(area, entry);
  });
  const of = (category: CategoryType) => [...areas.values()].filter((a) => a.category === category);
  const cities = of(CategoryType.City);
  const roads = of(CategoryType.Road);
  const forests = of(CategoryType.Forest);
  const wonders = of(CategoryType.Wonder);
  const crossroads = of(CategoryType.Stop).length > 0;

  const parts: string[] = [];
  if (wonders.length) parts.push(`${some(wonders.length, "wonder", "wonders")} at its centre`);
  if (crossroads) parts.push(`a crossroads at its centre`);
  // The cities by how many sides each opens onto ("a city open on every side", "two cities open on one side each").
  for (const n of [4, 3, 2, 1]) {
    const k = cities.filter((c) => c.sides.size === n).length;
    if (!k) continue;
    const reach = n === 4 ? "every side" : `${word(n)} side${n > 1 ? "s" : ""}`;
    parts.push(k === 1 ? `a city open on ${reach}` : `${word(k)} cities open on ${reach} each`);
  }
  // The roads: across the tile (two sides), or from one side to what holds its centre (the crossroads, a city, a wonder).
  const across = roads.filter((r) => r.sides.size >= 2).length;
  const ending = roads.filter((r) => r.sides.size === 1).length;
  if (across) parts.push(across === 1 ? "a road linking two sides" : `${word(across)} roads linking two sides each`);
  if (ending) {
    const centre = categories[0];
    const to = crossroads ? "ending there" : centre === CategoryType.Wonder ? `leading to it` : centre === CategoryType.City ? "ending at the city" : "ending at its centre";
    parts.push(`${some(ending, "road", "roads")} ${to}`);
  }
  if (forests.length) parts.push(some(forests.length, "forest", "forests"));
  const text = list(parts);
  return {
    cities: cities.length,
    roads: roads.length,
    forests: forests.length,
    wonders: wonders.length,
    deck: deckCount(plan.value),
    sentence: text ? `${text[0]!.toUpperCase()}${text.slice(1)}.` : "",
  };
}
