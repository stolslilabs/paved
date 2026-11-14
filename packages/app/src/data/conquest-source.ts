import type { ConquestBranch, ConquestCrest, ConquestLevels, ConquestPhase, ConquestPlayPhase, ConquestStructure, GuildRank, Rarity } from "@paved/game-core";
import type { JoustGuild } from "./joust-source";
import type { PublicProfile } from "./social-source";

// The Conquest's source (the season's finale, game-core's `conquest.ts`): the Conquest as a player sees it (its phase and day, the
// registration, their allegiance's rank, orders, Knowledge and tree, their own Offerings and exploration, the open build requests,
// the phases' results and the final one), a zone of the world's map, what fits a cell, the allegiances' ranking, the members' parts,
// and the player's writes. The mock's ledger answers it today (`data/mock/conquest.ts`): the whole event runs on the client, nothing
// on chain. Without one (the chain) the hooks answer `unavailable` and Play shows no Conquest card.

/** An allegiance as the Conquest shows it: its emblem and its name. */
export type ConquestGuild = JoustGuild;

/** An allegiance of the ranking: its place (1 first), its points by phase and in all. */
export interface ConquestRankRow {
  place: number;
  guild: ConquestGuild;
  foundation: number;
  awakening: number;
  frontiers: number;
  total: number;
  /** Its members now. */
  members: number;
  /** The viewer's allegiance. */
  mine: boolean;
}

/** A member of the viewer's allegiance: the tiles they gave, the cells they explored, the Knowledge they brought, their days of Offerings. */
export interface ConquestMemberRow {
  profile: PublicProfile;
  /** Their rank in the allegiance. */
  rank: GuildRank;
  tiles: number;
  explored: number;
  knowledge: number;
  days: number;
  me: boolean;
}

/** An open build request of the viewer's allegiance: the cell, the tile wanted, what giving it pays, who holds one. */
export interface ConquestRequestState {
  id: number;
  x: number;
  y: number;
  zone: number;
  zoneName: string;
  plan: number;
  orientation: number;
  rarity: Rarity;
  cobbles: number;
  by: PublicProfile;
  at: number;
  /** The copies the viewer can give (their inventory less their active village); 0: none. */
  held: number;
  /** The members who hold one, the viewer included. */
  holders: number;
}

/** A phase's result for the viewer's allegiance, once the phase is over: its place and points, the podium, the viewer's Cobbles. */
export interface ConquestPhaseResult {
  phase: ConquestPlayPhase;
  place: number;
  of: number;
  score: number;
  podium: ConquestRankRow[];
  /** The viewer's allegiance. */
  guild: ConquestGuild;
  /** What the viewer did in the phase: the tiles they gave, the cells they explored, the Knowledge they brought. */
  part: { tiles: number; explored: number; knowledge: number };
  /** The viewer's days of Offerings in the phase (of its seven), and whether they are enough to be paid. */
  days: number;
  eligible: boolean;
  cobbles: number;
  claimed: boolean;
}

/** A Conquest's final result for the viewer's allegiance, from D21. */
export interface ConquestFinal {
  conquest: number;
  /** The world's number, as shown: the first Conquest is World 1. */
  world: number;
  guild: ConquestGuild;
  /** Each phase's points and place. */
  phases: { phase: ConquestPlayPhase; score: number; place: number }[];
  place: number;
  of: number;
  score: number;
  foundation: number;
  awakening: number;
  frontiers: number;
  /** The crest the podium wears for the whole next season; null past the third. */
  crest: ConquestCrest | null;
  podium: ConquestRankRow[];
  days: number;
  eligible: boolean;
  cobbles: number;
  claimed: boolean;
  /** Everything of this Conquest the viewer can still claim: its phases and its final rank. */
  toClaim: number;
}

/** A zone of the world on the map: a province (its allegiance, null for an empty one) or a free zone. */
export interface ConquestZoneSummary {
  index: number;
  name: string;
  col: number;
  row: number;
  province: boolean;
  guild: ConquestGuild | null;
  /** The viewer's allegiance's province. */
  mine: boolean;
  /** Open to the viewer's allegiance now: they explore and build there. */
  open: boolean;
  tiles: number;
  /** The tiles of the viewer's allegiance in it. */
  own: number;
  explored: number;
}

/** A structure closed that the viewer's allegiance had tiles in. */
export interface ConquestScoredState {
  kind: ConquestStructure;
  size: number;
  /** The viewer's allegiance's tiles in it, and the most any other allegiance had. */
  own: number;
  rival: number;
  /** Who won it; null: a tie, nobody. */
  winner: ConquestGuild | null;
  won: boolean;
  points: number;
  day: number;
}

/** The viewer's allegiance in the Conquest. */
export interface ConquestAllegianceState {
  place: number;
  of: number;
  score: number;
  knowledge: number;
  earned: number;
  levels: ConquestLevels;
  /** The day's orders: given by the members' first Offerings (50 at most), used by the tiles built. */
  orders: { given: number; used: number; left: number };
  tiles: number;
  explored: number;
  closed: number;
  members: number;
}

/** The viewer's own Conquest. */
export interface ConquestMe {
  /** The Offerings that wait, when the next one comes (null: the bowl is full, or they are over), the seconds between two. */
  waiting: number;
  nextAt: number | null;
  every: number;
  /** Their first Offering of the day gave its order. */
  orderToday: boolean;
  exploredToday: boolean;
  /** Their days of Offerings so far. */
  days: number;
  knowledge: number;
  tiles: number;
  explored: number;
}

/** The Conquest as `viewer` sees it. */
export interface ConquestState {
  conquest: number;
  /** The world's number, as shown. */
  world: number;
  phase: ConquestPhase;
  /** 0 during the registration, then 1 to 28. */
  day: number;
  /** A rest day (D7, D14): nobody builds or explores. */
  rest: boolean;
  /** When the phase ends (the registration, a phase's last day of play and its rest day, the results). */
  phaseEndsAt: number;
  /** The next 00:00 UTC. */
  nextDayAt: number;
  /** The end of D28: the next Conquest's registration opens. */
  endsAt: number;
  /** The allegiances registered so far (all of them once day 1 began), the best season's Joust rating first. */
  registered: ConquestGuild[];
  /** The viewer's allegiance, their rank in it, and whether they lead (an Officer or the Leader); null: none. */
  guild: ConquestGuild | null;
  rank: GuildRank | null;
  leads: boolean;
  /** Their allegiance is registered (during the registration) or in the world (from day 1). */
  entered: boolean;
  /** The world's side in zones (0 during the registration) and its zones. */
  side: number;
  zones: ConquestZoneSummary[];
  /** The viewer's allegiance's province; null: none. */
  home: number | null;
  allegiance: ConquestAllegianceState | null;
  me: ConquestMe | null;
  requests: ConquestRequestState[];
  /** The last structures closed with a tile of the allegiance, the latest first. */
  scored: ConquestScoredState[];
  /** The phases over, in order. */
  results: ConquestPhaseResult[];
  final: ConquestFinal | null;
  /** The Cobbles of this Conquest the viewer can claim now. */
  toClaim: number;
  /** The Conquest before this one; null: none, or their allegiance was not in it. */
  previous: ConquestFinal | null;
}

/** A tile of a zone: an allegiance's (null: a pre-built wonder), who gave it. */
export interface ConquestTileState {
  x: number;
  y: number;
  plan: number;
  orientation: number;
  kind: "capital" | "wonder" | "great" | "tile";
  guild: ConquestGuild | null;
  mine: boolean;
  by: string | null;
}

/** One zone of the world as the viewer sees it: its tiles, its explored cells, where their allegiance may ask for a tile. */
export interface ConquestZoneState {
  conquest: number;
  zone: ConquestZoneSummary;
  /** Its south-west cell in the world, and its side in cells. */
  x0: number;
  y0: number;
  size: number;
  tiles: ConquestTileState[];
  explored: { x: number; y: number }[];
  /** The explored, empty cells next to a tile of the viewer's allegiance. */
  frontier: { x: number; y: number }[];
  requests: ConquestRequestState[];
  /** The viewer can explore a cell here now: the zone is open, a day of play, their exploration not made. */
  canExplore: boolean;
}

/**
 * A square of the world round a zone, for the map's scene: the zone and a band of its neighbours (half a zone wide), so that the
 * view shows what lies past the zone's edge. Cells are the world's.
 */
export interface ConquestAreaState {
  conquest: number;
  /** The zone the area is centred on. */
  zone: ConquestZoneSummary;
  /** The area's corners, both inside it. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tiles: ConquestTileState[];
  explored: { x: number; y: number }[];
  /** The explored, empty cells next to a tile of the viewer's allegiance, in the zones open to it. */
  frontier: { x: number; y: number }[];
  requests: ConquestRequestState[];
}

/** What fits a cell for the viewer's allegiance: each plan with its turns, its rarity, what giving it pays, who holds one. */
export interface ConquestOptions {
  x: number;
  y: number;
  plans: { plan: number; orientations: number[]; rarity: Rarity; cobbles: number; held: number; holders: number }[];
}

/** The ranking: the allegiances by points in all, with each phase's. */
export interface ConquestRanking {
  conquest: number;
  rows: ConquestRankRow[];
}

/** What a tile given did: the Cobbles paid, the structures closed, the orders left. */
export interface ConquestGiven {
  cobbles: number;
  scored: ConquestScoredState[];
  ordersLeft: number;
}

/** The Conquest's reads and the player's writes. */
export interface ConquestSource {
  state(viewer: string | null): Promise<ConquestState>;
  /** A zone of the world; refused (`not-available`) for a zone the world does not have, or during the registration. */
  zone(viewer: string | null, zone: number): Promise<ConquestZoneState>;
  /** The world round a zone (the map's scene); refused as `zone` is. */
  area(viewer: string | null, zone: number): Promise<ConquestAreaState>;
  /** The plans that fit a cell for the viewer's allegiance. */
  options(viewer: string, x: number, y: number): Promise<ConquestOptions>;
  ranking(viewer: string | null): Promise<ConquestRanking>;
  /** The members of the viewer's allegiance, by tiles given. */
  members(viewer: string): Promise<ConquestMemberRow[]>;
  /** Registers the player's allegiance, during the registration, by an Officer or the Leader. */
  register(player: string): Promise<{ conquest: number }>;
  /** The Offerings that wait: their Knowledge, and whether the first of the day gave an order. */
  offer(player: string): Promise<{ knowledge: number; order: boolean }>;
  /** The day's exploration: the cell's Knowledge, drawn. */
  explore(player: string, cell: { x: number; y: number }): Promise<{ knowledge: number }>;
  /** A build request, by an Officer or the Leader. */
  request(player: string, tile: { x: number; y: number; plan: number; orientation: number }): Promise<{ id: number }>;
  /** Gives a request's tile from the player's inventory: it is built at once. */
  give(player: string, request: number): Promise<ConquestGiven>;
  /** Buys a branch's next level, by an Officer or the Leader. */
  research(player: string, branch: ConquestBranch): Promise<{ level: number; cost: number }>;
  /** The Cobbles of a Conquest the player can claim: one part (a phase over or, from D21, the final rank), or everything due. */
  claim(player: string, conquest: number, part?: ConquestPlayPhase | "final"): Promise<{ cobbles: number }>;
}
