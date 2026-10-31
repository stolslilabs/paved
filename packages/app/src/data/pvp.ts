import { useRef } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type {
  Attack,
  AttackDeck,
  AttackMove,
  AttackPlay,
  BoardTile,
  DecodedEvent,
  GameViews,
  IndexedAttack,
  LeagueStatus,
  MatchmakerVillage,
  NpcLevel,
  PavedWriter,
  PvpMatch,
  PvpShield,
  PvpViews,
  ScoredStructure,
  VillageCell,
  VillageInfo,
  VillageTile,
  WriteResult,
} from "@paved/chain";
import { AttackRun, CAMPAIGNS, CENTER, CategoryType, OrientationType, PlanType, type AttackMoveCodes, type PlacedCodes } from "@paved/game-core";
import { stakesOf, type CrownStakes, type PvpCell, type PvpPlayer, type PvpVillage } from "../lib/pvp-rules";
import { orNone, savedLook, useAvatar } from "./avatar";
import { cobbleKeys } from "./cobbles";
import { addressKey, queryKeys } from "./keys";
import { pvpKeys } from "./pvp-keys";
import { usePlayerProgress } from "./player-progress";
import { useDataSources, type DataSources } from "./sources";
import { villageKeys, villageViews } from "./village";

// The PvP flow's data (#647 PR 2): the attacker's state in `Matchmaker` (#639: joined, the opponent drawn, the crowns, the
// league and the season, #644; the shield) and in `Arena` (#643: the open or last attack, its deck and moves), the defender's
// village (`Village`'s views, #640, as the village screen reads them), the defence log and the attacks made (the indexer's
// `pvp_attacks`), and the five writes: search, Next, start, play, surrender. A write's receipt events go into the cache
// (`setQueryData`), then one `invalidateQueries` reconciles the reads it touched. Nothing polls. A network without
// `Matchmaker` or `Arena` answers null (their views are `not-configured`): no PvP there yet. An attack is replayed on
// game-core's engine (`AttackRun`) for the board, the live score and the legal cells; the session keeps its engine between
// moves (`useAttackRun`).

/** The keys of the PvP reads: `pvp-keys.ts`. */
export { pvpKeys };

/** The sources' PvP views, or null (a views double without them). Probed as `villageViews` is. */
export function pvpViews(views: GameViews): PvpViews | null {
  const v = views as GameViews & Partial<PvpViews>;
  return typeof v.pvpMatch === "function" && typeof v.pvpAttack === "function" && typeof v.pvpMoves === "function" && typeof v.pvpLeague === "function"
    ? (v as PvpViews)
    : null;
}

/** The PvP writes: `PavedWriter`'s. */
export type PvpSigner = Pick<PavedWriter, "address" | "drawOpponent" | "startAttack" | "playAttack" | "surrenderAttack">;

/** The signer's PvP writes, or null: no signer, or one without them (read only). */
export function pvpSigner(sources: Pick<DataSources, "signer">): PvpSigner | null {
  const signer = sources.signer as (Partial<PvpSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.drawOpponent === "function" && typeof signer.startAttack === "function" && typeof signer.playAttack === "function" && typeof signer.surrenderAttack === "function"
    ? (signer as PvpSigner)
    : null;
}

type Result<T> = { data: T | null | undefined; isPending: boolean; error: Error | null };

/** No match drawn: an opponent of 0. */
export const noOpponent = (match: PvpMatch): boolean => BigInt(match.opponent) === 0n;

/** `Arena`'s attack status codes (`ATTACK_STATUS` of `@paved/chain`). */
export const ATTACK_OPEN = 1;
export const ATTACK_FINISHED = 2;
export const ATTACK_SURRENDERED = 3;

/** Where the attacker stands: joined or not, the match drawn, its open or last attack and that attack's deck, the shield. */
export interface PvpStatus {
  /** In the matchmaker's pool (`village(v).status` not 0): a village is joined by its operator. */
  joined: boolean;
  match: PvpMatch;
  attack: Attack;
  /** The open attack's deck; null without one. */
  deck: AttackDeck | null;
  shield: PvpShield;
  league: LeagueStatus;
}

/**
 * The attacker's PvP state (#647): `Matchmaker.village`, `current_match`, `shield` and `league`, `Arena.attack`, and the open
 * attack's `deck`. Null on a network without them; disabled without a player.
 */
export function usePvpStatus(playerId: string | null): Result<PvpStatus> {
  const { views } = useDataSources();
  const pvp = pvpViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && pvp !== null;
  const read = useQueries({
    queries: [
      { queryKey: pvpKeys.village(id), queryFn: () => orNone(() => pvp!.pvpVillage(id)), enabled },
      { queryKey: pvpKeys.match(id), queryFn: () => orNone(() => pvp!.pvpMatch(id)), enabled },
      { queryKey: pvpKeys.attack(id), queryFn: () => orNone(() => pvp!.pvpAttack(id)), enabled },
      { queryKey: pvpKeys.shield(id), queryFn: () => orNone(() => pvp!.pvpShield(id)), enabled },
      { queryKey: pvpKeys.league(id), queryFn: () => orNone(() => pvp!.pvpLeague(id)), enabled },
    ],
    combine: (results) => {
      const [village, match, attack, shield, league] = results as unknown as [
        UseQueryResult<MatchmakerVillage | null>,
        UseQueryResult<PvpMatch | null>,
        UseQueryResult<Attack | null>,
        UseQueryResult<PvpShield | null>,
        UseQueryResult<LeagueStatus | null>,
      ];
      return { village, match, attack, shield, league };
    },
  });
  const open = read.attack.data?.status === ATTACK_OPEN ? read.attack.data : null;
  const deck = useQuery({
    queryKey: pvpKeys.deck(id, open?.id ?? 0),
    queryFn: () => orNone(() => pvp!.pvpDeck(id, open!.id)),
    enabled: enabled && open !== null,
  });
  if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
  const { village, match, attack, shield, league } = read;
  const all = [village, match, attack, shield, league];
  const error = all.find((r) => r.error)?.error ?? (open ? deck.error : null) ?? null;
  if (all.some((r) => r.data === null) || (open && deck.data === null)) return { data: null, isPending: false, error };
  const ready = all.every((r) => r.data !== undefined) && (!open || deck.data !== undefined);
  // A failed read ends the wait: pending only while nothing failed.
  if (!ready) return { data: undefined, isPending: !error, error };
  return {
    data: { joined: village.data!.status !== 0, match: match.data!, attack: attack.data!, deck: open ? deck.data! : null, shield: shield.data!, league: league.data! },
    isPending: false,
    error,
  };
}

/** A village's cells and tiles in the chain's coordinates (the board's, `CENTER` the starter), as the PvP scenes draw them. */
export function boardOf(cells: readonly VillageCell[], tiles: readonly VillageTile[]): { cells: PvpCell[]; tiles: BoardTile[] } {
  return {
    cells: cells.map((c) => ({ x: CENTER + c.x, y: CENTER + c.y })),
    tiles: tiles.map((t) => ({ id: t.id, plan: t.plan, orientation: t.orientation, x: CENTER + t.x, y: CENTER + t.y })),
  };
}

/**
 * A player as the PvP screens show them (#647): the name (`name`, the indexer's or the wallet's), the level (`Setup`, #641),
 * the crowns (`Matchmaker.league`, a hold of an open attack counted, as the season's roll counts it) and the look they saved (#926). An NPC village has
 * no level (0). Null on a network without PvP; disabled without a player.
 */
export function usePvpPlayer(playerId: string | null, name: string | null): Result<PvpPlayer> {
  const { views } = useDataSources();
  const pvp = pvpViews(views);
  const id = playerId ?? "0x0";
  const league = useQuery({ queryKey: pvpKeys.league(id), queryFn: () => orNone(() => pvp!.pvpLeague(id)), enabled: playerId !== null && pvp !== null });
  const progress = usePlayerProgress(playerId);
  // The look they saved (#626; a new player's drawn one on the mock, #926): the rows' avatar, the initial until it is read.
  const look = savedLook(useAvatar(playerId).data);
  if (playerId === null) return { data: undefined, isPending: false, error: null };
  if (pvp === null || league.data === null) return { data: null, isPending: false, error: league.error };
  const error = league.error ?? progress.error ?? null;
  const ready = league.data !== undefined && progress.data !== undefined;
  if (!ready) return { data: undefined, isPending: !error, error };
  return { data: { name, address: playerId, level: progress.data?.level ?? 0, crowns: league.data!.crowns, look }, isPending: false, error };
}

/** The defender as the scout shows it: its village (cells, tiles, score: the target) and the crowns at stake. */
export interface PvpScoutData {
  village: PvpVillage;
  stakes: CrownStakes;
  /** The defender's tiles the attack draws: its placed tiles but the starter, or an NPC's Story deck. */
  tilesToPlay: number;
  /** An NPC village (#643): its Story level (its title the name shown), an open board; null for a player's. */
  npc: { title: string } | null;
  /**
   * The defender is behind a shield now (`Matchmaker.shield`: attacked since the draw): `start` refuses it, and `search` draws
   * another for free (the match's opponent has left the pool). An NPC village is never shielded.
   */
  shielded: boolean;
}

/** An NPC village's address is its id, 1 to 255 (`is_npc_address`; `@paved/chain`'s `isNpcAddress`). */
export const isNpc = (address: string): boolean => {
  const id = BigInt(address);
  return id >= 1n && id <= 255n;
};

/** The Story level an NPC village plays (`Arena.npc_level`), or null for a level the client does not know (none set). */
export const npcStory = (level: NpcLevel) => CAMPAIGNS.find((c) => c.id === level.campaign)?.levels.find((l) => l.id === level.level) ?? null;

/** The cells of an open board as the plan draws them: under its tiles and beside them. */
const openCells = (tiles: readonly BoardTile[]): PvpCell[] => [
  ...new Map(tiles.flatMap((t) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: t.x + dx!, y: t.y + dy! }))).map((c) => [`${c.x},${c.y}`, c])).values(),
];

/**
 * The scout's data (#647): the drawn defender's village (`Village.village`, `cells`, `tiles`) and the stakes of the match's
 * offer and cost (fixed at the draw, #639). An NPC village (an address 1 to 255) has no village: its board, deck and target
 * are its Story level's (`Arena.npc_level`), as `Arena.start` snapshots them. Null on a network without `Village` (or
 * `Arena` for an NPC); disabled without a match.
 */
export function usePvpScout(match: PvpMatch | null): Result<PvpScoutData> {
  const { views } = useDataSources();
  const village = villageViews(views);
  const pvp = pvpViews(views);
  const defender = match && !noOpponent(match) ? match.opponent : null;
  const npc = defender !== null && isNpc(defender);
  const npcId = npc ? Number(BigInt(defender!)) : 0;
  const id = defender ?? "0x0";
  const enabled = defender !== null && !npc && village !== null;
  const level = useQuery({ queryKey: pvpKeys.npcLevel(npcId), queryFn: () => orNone(() => pvp!.pvpNpcLevel(npcId)), enabled: npc && pvp !== null });
  const shield = useQuery({ queryKey: pvpKeys.shield(id), queryFn: () => orNone(() => pvp!.pvpShield(id)), enabled: defender !== null && !npc && pvp !== null });
  const read = useQueries({
    queries: [
      { queryKey: villageKeys.info(id), queryFn: () => orNone(() => village!.village(id)), enabled },
      { queryKey: villageKeys.cells(id), queryFn: () => orNone(() => village!.villageCells(id)), enabled },
      { queryKey: villageKeys.tiles(id), queryFn: () => orNone(() => village!.villageTiles(id)), enabled },
    ],
    combine: (results) => results as unknown as [UseQueryResult<VillageInfo | null>, UseQueryResult<VillageCell[] | null>, UseQueryResult<VillageTile[] | null>],
  });
  if (defender === null) return { data: undefined, isPending: false, error: null };
  if (npc) {
    if (pvp === null || level.data === null) return { data: null, isPending: false, error: level.error };
    if (level.data === undefined) return { data: undefined, isPending: !level.error, error: level.error };
    const story = npcStory(level.data);
    const tiles = tilesOf(new AttackRun({ territory: null, placed: npcPlaced(level.data) }));
    return {
      data: {
        village: { cells: openCells(tiles), tiles, score: story?.target ?? 0 },
        stakes: stakesOf(match!.offer, match!.cost),
        tilesToPlay: story?.deck.length ?? 0,
        npc: { title: story?.title ?? `Village ${npcId}` },
        shielded: false,
      },
      isPending: false,
      error: null,
    };
  }
  if (village === null) return { data: null, isPending: false, error: null };
  const [info, cells, tiles] = read;
  const error = info.error ?? cells.error ?? tiles.error ?? null;
  if (read.some((r) => r.data === null)) return { data: null, isPending: false, error };
  const ready = read.every((r) => r.data !== undefined);
  if (!ready) return { data: undefined, isPending: !error, error };
  const board = boardOf(cells.data!, tiles.data!);
  return {
    data: { village: { ...board, score: info.data!.score }, stakes: stakesOf(match!.offer, match!.cost), tilesToPlay: Math.max(0, tiles.data!.length - 1), npc: null, shielded: shield.data?.up ?? false },
    isPending: false,
    error,
  };
}

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** A move of `Arena.moves` as game-core's engine takes it. */
export const moveCodes = (move: AttackMove): AttackMoveCodes =>
  move.discard ? { plan: move.plan, discard: true } : { plan: move.plan, discard: false, orientation: move.orientation, cell: move.cell };

/** The board of an attack: the snapshot's territory (null: an NPC's open board) and the tiles on it before the first move. */
export interface AttackBoard {
  territory: readonly { x: number; y: number }[] | null;
  placed: readonly PlacedCodes[];
}

/** The tiles a Story level places before its first draw (an NPC village, #643), in codes; none for a level not found. */
export function npcPlaced(level: NpcLevel): PlacedCodes[] {
  const story = npcStory(level);
  return (story?.placed ?? []).map((t) => ({ plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: t.x, y: t.y }));
}

/**
 * An attack on game-core's engine that keeps its engine between moves: the moves read are applied past the ones it played
 * (each new receipt adds one), and it is rebuilt only for another board or moves that are not its own continued.
 */
export function useAttackRun(board: AttackBoard | null, moves: readonly AttackMove[] | null): { run: AttackRun; last: ReturnType<AttackRun["apply"]> | null } | null {
  const ref = useRef<{ board: AttackBoard; run: AttackRun; last: ReturnType<AttackRun["apply"]> | null } | null>(null);
  if (!board || !moves) return null;
  let held = ref.current;
  const codes = moves.map(moveCodes);
  const continued = held && held.board === board && held.run.played.length <= codes.length && held.run.played.every((m, i) => JSON.stringify(m) === JSON.stringify(codes[i]));
  if (!held || !continued) {
    const run = new AttackRun({ territory: board.territory, placed: board.placed });
    held = { board, run, last: null };
  }
  for (const move of codes.slice(held.run.played.length)) held.last = held.run.apply(move);
  ref.current = held;
  return { run: held.run, last: held.last };
}

/** An attack as its screen shows it, the hand's plan and legal cells included. */
export interface PvpAttackData {
  attack: Attack;
  target: number;
  /** The defender's territory in the board's coordinates (an NPC's open board: the cells around its tiles). */
  territory: PvpCell[];
  tiles: BoardTile[];
  score: number;
  delta: number | null;
  lastScored: ScoredStructure[];
  /** The defender's tiles left to draw, the one in hand included. */
  remaining: number;
  /** The plan in hand (0: none, the attack is over). */
  hand: number;
  /** The defender's tiles the stack's pile draws from: the deck's plans as the defender's village holds them. */
  pilePlans: number[];
  /** The engine, for the hand's legal cells and orientations. */
  run: AttackRun;
  /** An NPC village's Story level title (the name shown); null for a player's village. */
  npcTitle: string | null;
  /** The board the moves are played on, and the moves: a replay steps through them. */
  board: AttackBoard;
  moves: AttackMove[];
}

/** The board coordinates of the engine's tiles. */
const tilesOf = (run: AttackRun): BoardTile[] =>
  run.game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y }));

/**
 * An attack of `attacker` (#647), the open one or a finished one (a replay): its board from the defender's village at the
 * start (the territory is `Village.cells`' first `9 + parcels`, the snapshot of #643; an NPC's is its Story level's open
 * board), `Arena.moves` replayed on the engine, and the deck's hand. Null on a network without PvP; disabled without an attack.
 */
export function usePvpAttack(attacker: string | null, attack: Attack | null, deck: AttackDeck | null): Result<PvpAttackData> {
  const { views } = useDataSources();
  const pvp = pvpViews(views);
  const village = villageViews(views);
  const id = attacker ?? "0x0";
  const has = attacker !== null && attack !== null && attack.id !== 0 && pvp !== null;
  const defender = attack?.defender ?? "0x0";
  const npc = attack?.npc ?? false;
  const npcId = npc ? Number(BigInt(defender)) : 0;
  const read = useQueries({
    queries: [
      { queryKey: pvpKeys.moves(id, attack?.id ?? 0), queryFn: () => orNone(() => pvp!.pvpMoves(id, attack!.id)), enabled: has },
      { queryKey: villageKeys.cells(defender), queryFn: () => orNone(() => village!.villageCells(defender)), enabled: has && !npc && village !== null },
      { queryKey: villageKeys.tiles(defender), queryFn: () => orNone(() => village!.villageTiles(defender)), enabled: has && !npc && village !== null },
      { queryKey: pvpKeys.npcLevel(npcId), queryFn: () => orNone(() => pvp!.pvpNpcLevel(npcId)), enabled: has && npc },
    ],
    combine: (results) => results as unknown as [UseQueryResult<AttackMove[] | null>, UseQueryResult<VillageCell[] | null>, UseQueryResult<VillageTile[] | null>, UseQueryResult<NpcLevel | null>],
  });
  const [moves, cells, tiles, level] = read;
  const boardRef = useRef<{ key: string; board: AttackBoard } | null>(null);
  let board: AttackBoard | null = null;
  if (has) {
    const key = npc ? `npc:${npcId}:${JSON.stringify(level.data)}` : `village:${attack!.parcels}:${JSON.stringify(cells.data)}`;
    if (boardRef.current?.key === key) board = boardRef.current.board;
    else if (npc ? level.data : cells.data) {
      board = npc ? { territory: null, placed: npcPlaced(level.data!) } : { territory: cells.data!.slice(0, 9 + attack!.parcels), placed: [] };
      boardRef.current = { key, board };
    }
  }
  const played = useAttackRun(board, moves.data ?? null);
  if (!has) return { data: attacker !== null && pvp === null ? null : undefined, isPending: false, error: null };
  const used = npc ? [moves, level] : [moves, cells, tiles];
  const error = used.find((r) => r.error)?.error ?? null;
  if (used.some((r) => r.data === null)) return { data: null, isPending: false, error };
  if (!played || used.some((r) => r.data === undefined)) return { data: undefined, isPending: !error, error };
  const { run, last } = played;
  const boardTiles = tilesOf(run);
  const territory = board!.territory ? board!.territory.map((c) => ({ x: CENTER + c.x, y: CENTER + c.y })) : openCells(boardTiles);
  const story = npc ? npcStory(level.data!) : null;
  const hand = attack!.status === ATTACK_OPEN ? (deck?.hand ?? 0) : 0;
  return {
    data: {
      attack: attack!,
      target: attack!.target,
      territory,
      tiles: boardTiles,
      score: run.score,
      delta: last ? last.delta : null,
      lastScored: (last?.result.scored ?? []).map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points })),
      remaining: deck && attack!.status === ATTACK_OPEN ? deck.size - deck.drawn + (deck.hand ? 1 : 0) : 0,
      hand,
      pilePlans: npc ? (story?.deck ?? []).map((p) => PLANS.indexOf(p)) : tiles.data!.filter((t) => t.id !== 1).map((t) => t.plan),
      npcTitle: npc ? (story?.title ?? `Village ${npcId}`) : null,
      run,
      board: board!,
      moves: moves.data!,
    },
    isPending: false,
    error,
  };
}

/** The crowns an attack moved and how it ended, from its last receipt or the indexer's row. */
export interface PvpSettled {
  /** From the indexer's row only: the receipt does not carry them (the attack's view does). */
  target?: number;
  defender?: string;
  npc?: boolean;
  score: number;
  stars: number;
  surrendered: boolean;
  gained: number;
  lost: number;
}

/**
 * The crowns attack `id` of `attacker` moved (#647's result, a replay's metadata): its last receipt's `AttackFinished` if this
 * visit sent it, merged with the indexer's row of that attack (`/players/:attacker/attacks/:id`, however old), which alone
 * carries its target and defender (an attack no longer the attacker's last needs them). The receipt answers at once; the row
 * completes it. Null while neither is known and the indexer has not seen it end (its not-found).
 */
export function usePvpSettled(attacker: string | null, id: number | null): Result<PvpSettled> {
  const { indexer } = useDataSources();
  const client = useQueryClient();
  const who = attacker ?? "0x0";
  const fromReceipt = id === null ? undefined : client.getQueryData<PvpSettled>(pvpKeys.settled(who, id));
  const row = useQuery({
    queryKey: pvpKeys.attackRow(who, id ?? 0),
    queryFn: async () => {
      try {
        return settledOf((await indexer.playerAttack(who, id!)).data);
      } catch (error) {
        if ((error as { kind?: unknown } | null)?.kind === "not-found") return null;
        throw error;
      }
    },
    enabled: attacker !== null && id !== null,
  });
  if (attacker === null || id === null) return { data: undefined, isPending: false, error: null };
  if (fromReceipt) {
    // The receipt's figures, the row's target and defender once read; the row's failure is told, never hidden by the receipt.
    const merged = row.data ? { ...fromReceipt, target: row.data.target, defender: row.data.defender, npc: row.data.npc } : fromReceipt;
    return { data: merged, isPending: row.data === undefined && !row.error, error: row.error };
  }
  if (row.data === undefined) return { data: undefined, isPending: !row.error, error: row.error };
  return { data: row.data, isPending: false, error: null };
}

const settledOf = (a: IndexedAttack): PvpSettled => ({ target: a.target, defender: a.defender, npc: a.npc, score: a.score, stars: a.stars, surrendered: a.surrendered, gained: a.gained, lost: a.lost });

/**
 * The attacks on `playerId`'s village that ended, newest first (#647's defence log): the indexer's `pvp_attacks`. Disabled
 * without a player.
 */
export function useDefenceLog(playerId: string | null): UseQueryResult<IndexedAttack[]> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: pvpKeys.attacks(playerId ?? "0x0", "defender"),
    queryFn: async () => (await indexer.playerAttacks(playerId!, "defender", { limit: 50 })).data,
    enabled: playerId !== null,
  });
}

/** The attacks `playerId` made that ended, newest first (#786's matches on v1): the indexer's `pvp_attacks`. Disabled without a player. */
export function useAttackLog(playerId: string | null): UseQueryResult<IndexedAttack[]> {
  const { indexer } = useDataSources();
  return useQuery({
    queryKey: pvpKeys.attacks(playerId ?? "0x0", "attacker"),
    queryFn: async () => (await indexer.playerAttacks(playerId!, "attacker", { limit: 50 })).data,
    enabled: playerId !== null,
  });
}

/** The season `season`'s first second and the next one's: its end (0: the clock has not set them). */
export function useSeasonSpan(season: number | null): Result<{ start: number; end: number }> {
  const { views } = useDataSources();
  const pvp = pvpViews(views);
  const enabled = season !== null && season > 0 && pvp !== null;
  const read = useQueries({
    queries: [
      { queryKey: pvpKeys.seasonStart(season ?? 0), queryFn: () => orNone(() => pvp!.pvpSeasonStart(season!)), enabled },
      { queryKey: pvpKeys.seasonStart((season ?? 0) + 1), queryFn: () => orNone(() => pvp!.pvpSeasonStart(season! + 1)), enabled },
    ],
    combine: ([start, end]) => ({ start, end }),
  });
  if (!enabled) return { data: season === 0 ? { start: 0, end: 0 } : undefined, isPending: false, error: null };
  const error = read.start.error ?? read.end.error ?? null;
  if (read.start.data === null || read.end.data === null) return { data: null, isPending: false, error };
  const ready = read.start.data !== undefined && read.end.data !== undefined;
  return { data: ready ? { start: read.start.data!, end: read.end.data! } : undefined, isPending: !ready && !error, error };
}

/**
 * A PvP write's receipt into the cache: `OpponentDrawn` sets the match; `AttackOpened` the attack opened, `TileDrawn` the
 * deck's hand, `AttackPlayed` appends the move; `AttackFinished` ends the attack (its score and stars) and keeps the crowns it
 * moved (`pvpKeys.settled`); `AttackSkipped` clears the match. Everything else is left to the reconciling reads.
 */
export function applyPvpEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  const n = (v: unknown) => Number(v ?? 0);
  // A bool as the receipt decodes it: `true`, or a felt 1 in any of its forms.
  const flag = (v: unknown) => v === true || (v !== false && v !== undefined && v !== null && BigInt(v as string | number | bigint) === 1n);
  for (const { name, fields } of events) {
    if (name === "OpponentDrawn") {
      client.setQueryData<PvpMatch | null>(pvpKeys.match(playerId), () => ({ opponent: `0x${BigInt(fields.opponent as string).toString(16)}`, offer: n(fields.offer), cost: n(fields.cost), started: false }));
    } else if (name === "AttackSkipped") {
      client.setQueryData<PvpMatch | null>(pvpKeys.match(playerId), () => ({ opponent: "0x0", offer: 0, cost: 0, started: false }));
    } else if (name === "TileDrawn") {
      const id = n(fields.id);
      client.setQueryData<AttackDeck | null>(pvpKeys.deck(playerId, id), (d) => (d ? { ...d, drawn: n(fields.draw) + 1, hand: n(fields.plan) } : d));
    } else if (name === "AttackPlayed") {
      const id = n(fields.id);
      const move: AttackMove = flag(fields.discard)
        ? { plan: n(fields.plan), discard: true }
        : { plan: n(fields.plan), discard: false, orientation: n(fields.orientation), cell: { x: n(fields.x) - 0x7fffffff, y: n(fields.y) - 0x7fffffff } };
      client.setQueryData<AttackMove[] | null>(pvpKeys.moves(playerId, id), (m) => (m && m.length === n(fields.index) ? [...m, move] : m));
      client.setQueryData<AttackDeck | null>(pvpKeys.deck(playerId, id), (d) => (d ? { ...d, hand: 0 } : d));
    } else if (name === "AttackFinished") {
      const id = n(fields.id);
      const settled: PvpSettled = { score: n(fields.score), stars: n(fields.stars), surrendered: flag(fields.surrendered), gained: n(fields.gained), lost: n(fields.lost) };
      client.setQueryData(pvpKeys.settled(playerId, id), settled);
      client.setQueryData<Attack | null>(pvpKeys.attack(playerId), (a) =>
        a && a.id === id ? { ...a, status: settled.surrendered ? ATTACK_SURRENDERED : ATTACK_FINISHED, score: settled.score, stars: settled.stars } : a,
      );
    }
  }
}

/** A PvP write on its way: what it is for. */
export type PvpWrite = { kind: "search" } | { kind: "next" } | { kind: "start" } | { kind: "play"; play: AttackPlay } | { kind: "surrender" };

/**
 * The PvP writes of the connected account (#647): `search` (free) and `next` (a Cobble) draw an opponent on the VRF, `start`
 * opens the attack on it, `play` builds the tile in hand at a cell or discards it (the last move settles the attack), and
 * `surrender` ends it at 0 stars. Each puts its receipt's events into the cache and invalidates the reads it touched, after a
 * refusal too. `pending` is the write on its way, `error` the last refusal (`PvpRefusedError` or another `WriteError`) until
 * `reset`. `signer` is null without a signer that writes the PvP: read only.
 */
export function usePvpWrites(playerId: string | null) {
  const sources = useDataSources();
  const signer = pvpSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, PvpWrite>({
    mutationFn: (write) => {
      if (!signer) return Promise.reject(new Error("Connect to attack"));
      const views = pvpViews(sources.views);
      if (!views) return Promise.reject(new Error("PvP is not on this network yet: nothing was sent"));
      switch (write.kind) {
        case "search":
        case "next":
          return signer.drawOpponent(write.kind, views);
        case "start":
          return signer.startAttack(views);
        case "play":
          return signer.playAttack(write.play, views);
        case "surrender":
          return signer.surrenderAttack();
      }
    },
    onSuccess: ({ events }) => {
      if (playerId) applyPvpEvents(client, playerId, events);
    },
    onSettled: (_result, _error, write) => {
      if (!playerId) return;
      void client.invalidateQueries({ queryKey: pvpKeys.match(playerId) });
      void client.invalidateQueries({ queryKey: pvpKeys.attack(playerId) });
      void client.invalidateQueries({ queryKey: ["chain", "pvp", "deck", addressKey(playerId)] });
      void client.invalidateQueries({ queryKey: ["chain", "pvp", "moves", addressKey(playerId)] });
      void client.invalidateQueries({ queryKey: pvpKeys.league(playerId) });
      void client.invalidateQueries({ queryKey: pvpKeys.shield(playerId) });
      void client.invalidateQueries({ queryKey: pvpKeys.village(playerId) });
      if (write.kind === "next") void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
      // The last move or a surrender settles: the crowns, the rewards granted (#642), the XP, the attacks made.
      if (write.kind === "play" || write.kind === "surrender") {
        void client.invalidateQueries({ queryKey: villageKeys.grants(playerId) });
        void client.invalidateQueries({ queryKey: villageKeys.offer(playerId) });
        void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
        void client.invalidateQueries({ queryKey: queryKeys.chain.playerLevel(playerId) });
        void client.invalidateQueries({ queryKey: pvpKeys.attacks(playerId, "attacker") });
        void client.invalidateQueries({ queryKey: ["indexer", "pvpAttack", addressKey(playerId)] });
      }
    },
  });
  return {
    signer,
    pending: mutation.isPending ? mutation.variables : undefined,
    error: mutation.error,
    reset: () => mutation.reset(),
    search: () => mutation.mutateAsync({ kind: "search" }),
    next: () => mutation.mutateAsync({ kind: "next" }),
    start: () => mutation.mutateAsync({ kind: "start" }),
    play: (play: AttackPlay) => mutation.mutateAsync({ kind: "play", play }),
    surrender: () => mutation.mutateAsync({ kind: "surrender" }),
  };
}
