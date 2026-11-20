// The Town Hall's footprint on a board (TOWN-HALL): one 2 x 2 tile at the centre of a village, in place of the starter. Its
// building stands inside a closed ring of walls that is no structure of the game: it scores nothing. On the engine the tile is
// four cells, each a plan of the base deck, whose inner edges match each other. Three roads leave the walls, each by a gate of
// its own, to the west, the north and the south: three roads of their own (they end at the north-east cell's stop, inside the
// walls), which part the wood round the walls in three. Two pieces of city stand in the south-west corner, to the west and to
// the south. The outer edges, from the north-west clockwise: forest, road (north), forest, forest (east), road, city (south),
// city, road (west). Only those score. The client draws the four cells as one model
// (`packages/app/scripts/town-hall/model.ts` builds it on the same four plans).

/** One cell of the Town Hall: its quadrant, the contracts' plan and orientation codes, the cell relative to its south-west one. */
export interface TownHallTile {
  readonly quadrant: "sw" | "se" | "nw" | "ne";
  readonly plan: number;
  readonly orientation: number;
  readonly x: number;
  readonly y: number;
}

/** The four cells, in id order (ids 1 to 4): x east, y north. */
export const TOWN_HALL_TILES: readonly TownHallTile[] = [
  { quadrant: "sw", plan: 6, orientation: 4, x: 0, y: 0 }, // FFCFFFFFC facing West: a piece of city to the west, one to the south
  { quadrant: "se", plan: 10, orientation: 2, x: 1, y: 0 }, // RFFFRFFFR facing East: the road south
  { quadrant: "nw", plan: 10, orientation: 1, x: 0, y: 1 }, // RFFFRFFFR facing North: the road west
  { quadrant: "ne", plan: 16, orientation: 4, x: 1, y: 1 }, // SFRFRFFFR facing West: the road north, and where the three end
];

/** Whether a cell is one of the Town Hall's. */
export const isTownHallCell = (x: number, y: number): boolean => (x === 0 || x === 1) && (y === 0 || y === 1);
