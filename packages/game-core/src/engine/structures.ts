// The structure state of the contracts: a union-find over the nodes (an area of a placed tile)
// with the size and the open half-edges of each root, placed as `contracts/src/structure/placement.cairo`
// places a tile (steps 1 and 2 of `docs/architecture/structure-state.md`), and the forest scan of
// `structure/forest.cairo`.
//
// Departure from the Cairo structure, by design: the records live in a `Map` (no pages, no packing)
// and each root also keeps the set of its distinct tiles, merged by a union. On chain D-19 counts a
// structure's tiles by a walk at scoring (design note, "The two counting designs"); off chain the set
// costs nothing and gives the same count.

import { Category, CategoryType } from "../types/category";
import {
  areaAt,
  areaRow,
  categoryOf,
  movesOf,
  recordAreas,
  toward,
  wonderArea,
} from "./geometry";

/** A placed tile of the board. Plan and orientation are contract codes; `x, y` relative to the starter. */
export interface BoardTile {
  readonly id: number;
  readonly plan: number;
  readonly orientation: number;
  readonly x: number;
  readonly y: number;
  readonly owner: bigint;
  /** The structure id of each area at placement (index `area`, 0 for an area without moves). */
  readonly refs: readonly number[];
}

interface StructureRecord {
  parent: number;
  size: number;
  open: number;
  tiles: Set<number>;
}

export function positionKey(x: number, y: number): string {
  return `${x},${y}`;
}

export class Board {
  readonly byPosition = new Map<string, BoardTile>();
  readonly byId = new Map<number, BoardTile>();
  private readonly records = new Map<number, StructureRecord>();

  clone(): Board {
    const board = new Board();
    for (const [key, tile] of this.byPosition) board.byPosition.set(key, tile);
    for (const [id, tile] of this.byId) board.byId.set(id, tile);
    for (const [sid, record] of this.records) {
      board.records.set(sid, { ...record, tiles: new Set(record.tiles) });
    }
    return board;
  }

  at(x: number, y: number): BoardTile | undefined {
    return this.byPosition.get(positionKey(x, y));
  }

  /** The root of a structure id and its record. */
  find(sid: number): { root: number; record: StructureRecord } {
    let root = sid;
    let record = this.records.get(root);
    if (!record) throw new Error("Structure: none");
    while (record.parent !== 0) {
      root = record.parent;
      record = this.records.get(root) as StructureRecord;
    }
    return { root, record };
  }

  /** The root of `area` of a placed tile. */
  rootOf(tile: BoardTile, area: number): { root: number; record: StructureRecord } {
    return this.find(tile.refs[area]);
  }

  private closeOne(record: StructureRecord): void {
    if (record.open === 0) throw new Error("Structure: not open");
    record.open -= 1;
  }

  /**
   * Places `tile` (orientation and position set, not yet on the board) on the structure state and
   * the board, and returns it with its refs: the half-edges of the neighbours that point at it
   * close, then each area with moves founds a structure or joins those it reaches into one.
   */
  place(tile: Omit<BoardTile, "refs">): BoardTile {
    // [Effect] The wonders around: their half-edge towards the tile closes (it has no spot)
    for (let direction = 1; direction <= 8; direction++) {
      const [x, y] = toward(tile.x, tile.y, direction);
      const neighbor = this.at(x, y);
      if (!neighbor) continue;
      const wonder = wonderArea(neighbor.plan);
      if (wonder !== 0) this.closeOne(this.rootOf(neighbor, wonder).record);
    }

    // [Effect] The nodes of the tile, in area order
    const refs: number[] = Array(10).fill(0);
    for (const area of recordAreas(tile.plan)) {
      let open = 0;
      const roots: number[] = [];
      for (const [direction, spot] of movesOf(tile.plan, tile.orientation, area)) {
        const [x, y] = toward(tile.x, tile.y, direction);
        const neighbor = this.at(x, y);
        if (spot === 0) {
          // A wonder's half-edge: it asks only for the tile
          if (!neighbor) open += 1;
          continue;
        }
        const landing = neighbor ? areaAt(neighbor.plan, neighbor.orientation, spot) : 0;
        if (!neighbor || landing === 0) {
          open += 1;
          continue;
        }
        // [Effect] The half-edge of the neighbour that answers this move closes
        const { root, record } = this.rootOf(neighbor, landing);
        this.closeOne(record);
        if (!roots.includes(root)) roots.push(root);
      }
      refs[area] = roots.length === 0 ? this.found(tile, area, open) : this.merge(tile, roots, open);
    }

    // [Effect] Every ref of the tile points at its final root
    for (let area = 1; area <= 9; area++) {
      if (refs[area] !== 0) refs[area] = this.find(refs[area]).root;
    }
    const placed: BoardTile = { ...tile, refs };
    this.byPosition.set(positionKey(tile.x, tile.y), placed);
    this.byId.set(tile.id, placed);
    return placed;
  }

  private found(tile: Omit<BoardTile, "refs">, area: number, open: number): number {
    const row = areaRow(tile.plan, area);
    const sid = tile.id * 16 + (row ? row.recordIndex : 0);
    this.records.set(sid, { parent: 0, size: 1, open, tiles: new Set([tile.id]) });
    return sid;
  }

  /** Joins the roots into the largest (lowest id on a tie), with the new node: `state::merge`. */
  private merge(tile: Omit<BoardTile, "refs">, roots: number[], open: number): number {
    let root = roots[0];
    let best = (this.records.get(root) as StructureRecord).size;
    for (const candidate of roots.slice(1)) {
      const size = (this.records.get(candidate) as StructureRecord).size;
      if (size > best || (size === best && candidate < root)) {
        root = candidate;
        best = size;
      }
    }
    const kept = this.records.get(root) as StructureRecord;
    let size = 1;
    let opens = open;
    const tiles = new Set([tile.id]);
    for (const other of roots) {
      const record = this.records.get(other) as StructureRecord;
      size += record.size;
      opens += record.open;
      for (const id of record.tiles) tiles.add(id);
      if (other !== root) record.parent = root;
    }
    kept.size = size;
    kept.open = opens;
    kept.tiles = tiles;
    return root;
  }

  /**
   * Walks the closed forest of `area` of `tile` and returns whether an adjacent road is still open,
   * the distinct closed roads and the distinct closed cities adjacent to it (`forest::scan`).
   */
  scan(tile: BoardTile, area: number): { openRoad: boolean; roads: number; cities: number } {
    const visited = new Set<string>([`${tile.id}:${area}`]);
    const roadRoots = new Set<number>();
    const cityRoots = new Set<number>();
    const nodes: [BoardTile, number][] = [[tile, area]];
    for (let index = 0; index < nodes.length; index++) {
      const [node, nodeArea] = nodes[index];
      const row = areaRow(node.plan, nodeArea);
      if (!row) continue;
      // [Compute] The roads around the node: each must be closed, and counts once
      for (let other = 1; other <= 9; other++) {
        if ((row.adjacentRoads & (1 << (other - 1))) === 0) continue;
        const { root, record } = this.rootOf(node, other);
        if (record.open !== 0) return { openRoad: true, roads: roadRoots.size, cities: cityRoots.size };
        roadRoots.add(root);
      }
      // [Compute] The cities around the node: only a closed one counts, once
      for (let other = 1; other <= 9; other++) {
        if ((row.adjacentCities & (1 << (other - 1))) === 0) continue;
        const { root, record } = this.rootOf(node, other);
        if (record.open === 0) cityRoots.add(root);
      }
      // [Compute] The next nodes of the forest
      for (const [direction, spot] of movesOf(node.plan, node.orientation, nodeArea)) {
        if (spot === 0) continue;
        const [x, y] = toward(node.x, node.y, direction);
        const next = this.at(x, y);
        if (!next) throw new Error("Forest scan: open forest");
        const landing = areaAt(next.plan, next.orientation, spot);
        const key = `${next.id}:${landing}`;
        if (!visited.has(key)) {
          visited.add(key);
          nodes.push([next, landing]);
        }
      }
    }
    return { openRoad: false, roads: roadRoots.size, cities: cityRoots.size };
  }
}

/** A placed tile as the structure board takes it: its id, its plan and orientation (contract codes), its position. */
export interface StructureTileInput {
  readonly id: number;
  readonly plan: number;
  readonly orientation: number;
  readonly x: number;
  readonly y: number;
}

/**
 * A structure of the board with its nodes: its root, its category, its distinct tiles (what D-19 counts) and its nodes
 * (an area of a tile), its open half-edges, and the areas it holds on each of its tiles (tile id to a mask, bit
 * `area - 1`): what a view needs to draw one structure across its tiles (the renderer's lit areas).
 */
export interface StructureAreas {
  readonly root: number;
  readonly category: CategoryType;
  readonly tiles: number;
  readonly nodes: number;
  readonly open: number;
  readonly areas: ReadonlyMap<number, number>;
}

/**
 * A read-only view of the structures of a set of placed tiles: the engine's union-find (`Board`) kept inside, the tiles
 * placed once, in id order as the game placed them. A board that changes builds a new view. Tiles that do not fit
 * together (a half-edge closed twice) throw, as the engine does.
 */
export class StructureBoard {
  private readonly all: readonly StructureAreas[];
  private readonly byNode: ReadonlyMap<string, StructureAreas>;

  constructor(tiles: Iterable<StructureTileInput>) {
    const board = new Board();
    for (const { id, plan, orientation, x, y } of [...tiles].sort((a, b) => a.id - b.id)) board.place({ id, plan, orientation, x, y, owner: 0n });
    const byRoot = new Map<number, { category: CategoryType; tiles: number; nodes: number; open: number; areas: Map<number, number> }>();
    const byNode = new Map<string, number>();
    for (const tile of [...board.byId.values()].sort((a, b) => a.id - b.id)) {
      for (let area = 1; area <= 9; area++) {
        if (!tile.refs[area]) continue;
        const { root, record } = board.rootOf(tile, area);
        let entry = byRoot.get(root);
        if (!entry) {
          entry = { category: Category.from(categoryOf(tile.plan, area)).value, tiles: record.tiles.size, nodes: record.size, open: record.open, areas: new Map() };
          byRoot.set(root, entry);
        }
        entry.areas.set(tile.id, (entry.areas.get(tile.id) ?? 0) | (1 << (area - 1)));
        byNode.set(`${tile.id}:${area}`, root);
      }
    }
    const structures = new Map([...byRoot].map(([root, entry]) => [root, Object.freeze({ root, ...entry }) as StructureAreas]));
    this.all = Object.freeze([...structures.values()]);
    this.byNode = new Map([...byNode].map(([node, root]) => [node, structures.get(root)!]));
  }

  /** Every structure, in the order of its first node (tiles by id, then areas). */
  structures(): readonly StructureAreas[] {
    return this.all;
  }

  /** The structure of `area` of the tile `tileId`; null for an area with no structure, or a tile not on the board. */
  structureOf(tileId: number, area: number): StructureAreas | null {
    return this.byNode.get(`${tileId}:${area}`) ?? null;
  }
}
