import { useRef } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { DayView, GameKey, GameView, IndexedGame, TermsView, TileView, WriteResult } from "@paved/chain";
import { CENTER, CategoryType, EngineGame, OrientationType, PlanType } from "@paved/game-core";
import type { SettleProps } from "../components/scenes/over-scene";
import { useGame, useEconomyDay, useTerms } from "./chain";
import { addressKey, queryKeys } from "./keys";
import { useIndexedGame } from "./indexer";
import { useDataSources } from "./sources";
import type { Closing } from "./training";

// The Challenge's over page (P7a, section 6.4): `Challenge.game(id)`, `Economy.terms(id)`, `Economy.day(day)`, the indexer's
// game, the closings replayed from the game's tiles, and the write `Economy.settle`. Nothing polls: a receipt sets the
// cache, then the reads it touched are read again once.

/** A day, in seconds: the chain's `SECONDS_PER_DAY` (`@paved/chain` is a type-only import in the route's chunk). */
export const DAY_SECONDS = 86_400;

/** A paid game expires 24 h after its purchase (P-34). */
export const expiryOf = (purchasedAt: number): number => purchasedAt + DAY_SECONDS;

/** Day `day` (a chain day id) settles only after the next day ends, `(day + 2) x 86400` (P-34): `settlesAfter` of `@paved/chain`. */
export const settlesAfter = (day: number): number => (day + 2) * DAY_SECONDS;

/** The cliff in points x 1,000, `mean x (10,000 + sigma) / 10,000` (`curve::threshold`); the mean is the closed day's. */
export const thresholdOf = (mean: number, sigmaBps: number): number => Math.floor((mean * (10_000 + sigmaBps)) / 10_000);

/**
 * What the page says of a finished game's reward. `threshold` is in points (the chain's points x 1,000, over 1,000); null
 * while the day is open (its mean is fixed when the day closes, at the first settle after it).
 */
export type OverReward =
  /** No economy deployment: the reward cannot be read. */
  | { kind: "none" }
  /** A free game (`GameSpawned.price == 0`): no stake, no reward, nothing to settle. */
  | { kind: "free" }
  /** Not finished within 24 h of its purchase: no reward, whenever it is settled. `deadline` is `terms.time + 86400`. */
  | { kind: "expired"; deadline: number; threshold: number | null }
  /** Settled above the threshold: the PAVED minted. */
  | { kind: "rewarded"; amount: bigint; threshold: number | null }
  /** Settled below the threshold: the stake is lost. */
  | { kind: "below"; threshold: number | null }
  /** Recorded, not settled. */
  | { kind: "pending"; threshold: number | null };

const milli = (value: number | null): number | null => (value === null ? null : value / 1000);

/**
 * The reward of a game from where each value is read: `terms` (the settlement: `settled`, `reward`, `expired`, the frozen
 * `sigmaBps`), `day` (the closed day's mean) and the indexer's record (`free`, and the threshold the contract used once
 * settled: its `Settled` event). A free game is the indexer's `free` or a game the economy never sold (`stake` 0).
 */
export function rewardOf(terms: TermsView | null, day: DayView | null, indexed: IndexedGame | undefined): OverReward {
  if (indexed?.free || terms?.stake === 0) return { kind: "free" };
  if (!terms) return { kind: "none" };
  // The contract's threshold once settled (the indexer), else the closed day's mean shifted by the game's own sigma.
  const settledThreshold = indexed?.economy?.threshold ?? null;
  const threshold = settledThreshold ?? (day?.closed ? thresholdOf(day.mean, terms.sigmaBps) : null);
  if (terms.expired) return { kind: "expired", deadline: expiryOf(terms.time), threshold: milli(threshold) };
  if (!terms.settled) return { kind: "pending", threshold: milli(threshold) };
  return terms.reward > 0n ? { kind: "rewarded", amount: terms.reward, threshold: milli(threshold) } : { kind: "below", threshold: milli(threshold) };
}

/** Where a game that is bought and not settled stands: its day cannot be settled yet, or it can. */
export function settleReady(terms: TermsView, now: number): boolean {
  return now >= settlesAfter(terms.day);
}

// --- Closings ---------------------------------------------------------------------------------------------------------

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);
/** `TileView.status` codes (the chain's `TILE_STATUS`). */
const PLACED = 1;
const DISCARDED = 2;
const HELD = 3;

/**
 * Every closing of a game, in move order, with the tile that closed it: the game's tiles replayed on the engine from
 * `initial_seed`, as the board opens a game (`replayChallenge`). The indexer keeps the `Scored` events but its game record
 * does not list them, so the closings are the engine's. Throws when a tile is not the engine's draw, a placement is
 * refused, or the replay's score is not the chain's: the list is never shown from a replay that disagrees.
 */
export function replayClosings(initialSeed: bigint, tiles: readonly TileView[], game: Pick<GameView, "playerId" | "deckSize" | "over" | "score">): Closing[] {
  const engine = EngineGame.start({ deck: "simple", seed: initialSeed, player: BigInt(game.playerId), tileLimit: game.deckSize });
  const drawn = [...tiles].sort((a, b) => a.id - b.id);
  const starter = drawn[0];
  if (!starter || starter.id !== 1 || starter.x !== CENTER || starter.y !== CENTER) throw new Error("Replay: no starter at the centre");
  const closings: Closing[] = [];
  for (const tile of drawn.slice(1)) {
    const hand = engine.hand;
    if (!hand || hand.id !== tile.id || PLANS.indexOf(hand.plan) !== tile.plan) throw new Error(`Replay: tile ${tile.id} is not the engine's draw`);
    if (tile.status === PLACED) {
      const orientation = ORIENTATIONS[tile.orientation];
      if (!orientation || orientation === OrientationType.None) throw new Error(`Replay: tile ${tile.id} has no orientation`);
      const result = engine.build({ orientation, x: tile.x - CENTER, y: tile.y - CENTER });
      for (const s of result.scored) closings.push({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points, tileId: result.tileId });
    } else if (tile.status === DISCARDED) {
      engine.discard();
    } else if (tile.status === HELD) {
      break;
    } else {
      throw new Error(`Replay: tile ${tile.id} has status ${tile.status}`);
    }
  }
  // A surrendered game keeps its last tile in hand, as on chain.
  if (game.over && !engine.over) engine.surrender();
  if (engine.score !== game.score) throw new Error(`Replay: score ${engine.score}, chain ${game.score}`);
  return closings;
}

/** The closings' key: under `chain`, so a refresh of the chain's reads covers them. A game's tiles never change once it is over. */
export const closingsKey = (gameId: number) => ["chain", "closings", gameId] as const;

/** Every closing of a finished game (`replayClosings` on its `initial_seed` and `tiles`). */
export function useClosings(game: GameView | undefined): UseQueryResult<Closing[]> {
  const { views } = useDataSources();
  const id = game?.over ? game.id : null;
  return useQuery({
    queryKey: closingsKey(id ?? 0),
    queryFn: async () => {
      const key: GameKey = { mode: "challenge", gameId: id as number };
      const [seed, tiles] = await Promise.all([views.initialSeed(key), views.tiles(key)]);
      return replayClosings(BigInt(seed), tiles, game as GameView);
    },
    enabled: id !== null,
    staleTime: Infinity,
    retry: false,
  });
}

// --- The page's reads -------------------------------------------------------------------------------------------------

/** A read of the chain said the game does not exist (`ViewError` kind `game-not-found`). */
export const isGameNotFound = (error: unknown): boolean => (error as { kind?: unknown } | null)?.kind === "game-not-found";

export type OverRead =
  | { status: "loading" }
  | { status: "error"; error: Error; retry: () => void }
  | { status: "not-found" }
  /** The game is still in play: its board is where it belongs. */
  | { status: "playing" }
  | { status: "ready"; game: GameView; terms: TermsView | null; day: DayView | null; indexed: IndexedGame | undefined; closings: UseQueryResult<Closing[]> };

/**
 * The reads of `/game/:id/over`: the game (`Challenge.game`), then, once it is over, its terms (`Economy.terms`), its
 * day (`Economy.day`, for a bought game), the indexer's record and the closings. A failed chain read is an error with a
 * retry that reads the failed ones again; the indexer's record is not needed to show the page (a game just finished is
 * not indexed yet), so its failure is not an error.
 */
export function useOverRead(gameId: number | null): OverRead {
  const game = useGame(gameId);
  const finished = game.data?.over === true ? gameId : null;
  const terms = useTerms(finished);
  const day = useEconomyDay(terms.data && terms.data.stake > 0 ? terms.data.day : null);
  const indexed = useIndexedGame(finished);
  const closings = useClosings(game.data);

  if (gameId === null || isGameNotFound(game.error)) return { status: "not-found" };
  const failed = [game, terms, day].filter((q) => q.error);
  if (failed.length) return { status: "error", error: failed[0].error as Error, retry: () => failed.forEach((q) => void q.refetch()) };
  if (!game.data) return { status: "loading" };
  if (!game.data.over) return { status: "playing" };
  // The terms and the day of a bought game are read before the page is shown: its reward depends on them.
  if (terms.data === undefined || (terms.data !== null && terms.data.stake > 0 && day.data === undefined)) return { status: "loading" };
  return { status: "ready", game: game.data, terms: terms.data, day: day.data ?? null, indexed: indexed.data, closings };
}

// --- Settle -----------------------------------------------------------------------------------------------------------

/** The `Settled` event of `gameId` in a receipt (Economy's `Settled`): its reward in PAVED base units, or null when it has none. */
export function settledIn(result: WriteResult, gameId: number): { reward: bigint; threshold: number } | null {
  for (const event of result.events) {
    if (event.name !== "Settled" || Number(event.fields.gameId) !== gameId) continue;
    return { reward: BigInt(event.fields.reward as bigint | number | string), threshold: Number(event.fields.threshold) };
  }
  return null;
}

/** A settle's receipt into the cache: the game's terms are settled with the reward the event carries. */
export function applySettled(client: ReturnType<typeof useQueryClient>, gameId: number, settled: { reward: bigint }): void {
  client.setQueryData<TermsView | null>(queryKeys.chain.terms(gameId), (terms) => (terms ? { ...terms, settled: true, reward: settled.reward } : terms));
}

export interface SettleControl {
  /** The connected account may settle: a signer and an economy's writer. */
  available: boolean;
  /** Sends the settle; resolves once it is confirmed or refused (the refusal is `error`). A second call while one is on its way does nothing. */
  settle: () => Promise<void>;
  pending: boolean;
  error: Error | null;
  /** This page sent the settle that is now in the cache. */
  done: boolean;
}

/**
 * `Economy.settle([gameId])` for the connected account. The receipt's `Settled` sets the game's terms in the cache, then the
 * terms, the day and the player's PAVED balance are read once more (the reconciling read). After a refusal the terms are read
 * again too: the chain's answer may differ from the page's (someone else settled the game).
 */
export function useSettle(gameId: number, playerId: string | null): SettleControl {
  const { signer = null, settlements = null } = useDataSources();
  const client = useQueryClient();
  // Set at once, not by a render: a second tap before the page re-renders must not reach the writer.
  const sending = useRef(false);
  const mutation = useMutation<WriteResult, Error, void>({
    mutationFn: () => (signer && settlements ? settlements(signer).settle([gameId]) : Promise.reject(new Error("Connect to settle"))),
    onSuccess: (result) => {
      const settled = settledIn(result, gameId);
      if (settled) applySettled(client, gameId, settled);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.chain.terms(gameId) });
      void client.invalidateQueries({ queryKey: ["chain", "economy", "day"] });
      void client.invalidateQueries({ queryKey: ["indexer", "game"] });
      if (playerId) void client.invalidateQueries({ queryKey: queryKeys.chain.pavedBalance(playerId) });
    },
  });
  return {
    available: signer !== null && settlements !== null,
    pending: mutation.isPending,
    error: mutation.error,
    done: mutation.isSuccess,
    settle: async () => {
      if (!signer || !settlements || sending.current) return;
      sending.current = true;
      try {
        await mutation.mutateAsync();
      } catch {
        // The refusal is `error`.
      } finally {
        sending.current = false;
      }
    },
  };
}

/** Whether `viewer` is the game's player (addresses compare as numbers). */
export const isPlayer = (viewer: string | null | undefined, playerId: string): boolean => !!viewer && addressKey(viewer) === addressKey(playerId);

/**
 * The scene's settle area for a bought game that is recorded, or null when there is nothing to settle (a game settled
 * before this page, or expired, shows its reward alone): the day cannot be settled yet, a guest connects, the player settles,
 * anyone else sees that it can be.
 */
export function settleProps(
  terms: TermsView,
  playerId: string,
  now: number,
  viewer: string | null,
  control: SettleControl,
  actions: { connect: () => void },
): SettleProps | null {
  if (terms.stake === 0 || terms.expired) return null;
  if (terms.settled) return control.done ? { state: "settled" } : { state: "done" };
  if (!settleReady(terms, now)) return { state: "after", at: settlesAfter(terms.day) };
  if (viewer === null) return { state: "connect", onConnect: actions.connect };
  if (!isPlayer(viewer, playerId)) return { state: "viewing" };
  // A signer with no settlement (no economy to send it through): nothing to press.
  if (!control.available) return null;
  if (control.pending) return { state: "pending" };
  if (control.error) return { state: "refused", message: control.error.message, onSettle: () => void control.settle() };
  return { state: "ready", onSettle: () => void control.settle() };
}
