// A Challenge game held by the engine as a stand-in for the contract (the parity goldens pin the engine to it), for the
// tests of `PredictedSession`: the views it reads (`game`, `tiles`, `initial_seed`) and the receipts its moves get, with
// the contract's events. A test can hold a receipt back, refuse a move, or move the game behind the session's back.
import { CENTER, CategoryType, EngineGame, OrientationType, PlanType } from "@paved/game-core";
import type { DecodedEvent } from "../src/codec";
import { TILE_STATUS, type GameKey, type GameView, type TileView } from "../src/views";
import { WriteError, type WriteResult } from "../src/writer";

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

export const PLAYER = "0xabc";

export class EngineChain {
  game: EngineGame;
  /** Every drawn tile, in draw order, as `tiles()` lists them: a discard at (0, 0). */
  readonly drawn: TileView[] = [];
  calls: string[] = [];
  /** Set to hold the next receipts until `release()`. */
  hold = false;
  private waiting: Array<() => void> = [];
  /** The next move is refused with this error (and nothing moves). */
  refuseNext: Error | null = null;

  constructor(
    readonly key: GameKey,
    readonly initialSeed: bigint,
    readonly expiresAt = 2 ** 40,
  ) {
    this.game = EngineGame.start({ deck: "simple", seed: initialSeed, player: BigInt(PLAYER) });
    this.drawn.push({ id: 1, status: TILE_STATUS.placed, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: 3, x: CENTER, y: CENTER });
    this.drawHand();
  }

  /** `GameViews` for the session: `game`, `tiles`, `initialSeed`. */
  readonly views = {
    game: async (key: GameKey): Promise<GameView> => {
      this.calls.push(`game ${key.gameId}`);
      return this.view();
    },
    tiles: async (key: GameKey): Promise<TileView[]> => {
      this.calls.push(`tiles ${key.gameId}`);
      return this.drawn.map((t) => ({ ...t }));
    },
    initialSeed: async (key: GameKey): Promise<string> => {
      this.calls.push(`initial_seed ${key.gameId}`);
      return `0x${this.initialSeed.toString(16)}`;
    },
  };

  view(): GameView {
    const g = this.game;
    const hand = g.hand;
    return {
      id: this.key.gameId, playerId: PLAYER, mode: 1, seed: `0x${g.seed.toString(16)}`, score: g.score, over: g.over,
      tileCount: g.tileCount, placedCount: g.built + 1, discardedCount: g.discarded, tileId: hand?.id ?? 0,
      plan: hand ? PLANS.indexOf(hand.plan) : 0, remainingCount: 0, deckSize: g.tileLimit, startTime: 1, endTime: 0, dayId: 0,
      expiresAt: this.expiresAt,
    };
  }

  /** Lets the held receipts arrive. */
  release(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const go of waiting) go();
  }

  get held(): number {
    return this.waiting.length;
  }

  /** The writes of the game: what `PavedWriter.build`, `discard` and `surrender` return. */
  build(move: { orientation: number; x: number; y: number }): Promise<WriteResult> {
    return this.write(() => {
      const hand = this.game.hand!;
      const result = this.game.build({ orientation: ORIENTATIONS[move.orientation]!, x: move.x - CENTER, y: move.y - CENTER });
      this.settle(hand.id, { status: TILE_STATUS.placed, ...move });
      const events = [
        this.event("Built", { playerId: PLAYER, tileId: hand.id, plan: PLANS.indexOf(hand.plan), ...move }),
        ...result.scored.map((s) => this.event("Scored", { playerId: PLAYER, category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points })),
      ];
      return result.over ? [...events, this.over()] : events;
    });
  }

  discard(): Promise<WriteResult> {
    return this.write(() => {
      const hand = this.game.hand!;
      const result = this.game.discard();
      this.settle(hand.id, { status: TILE_STATUS.discarded, orientation: 0, x: 0, y: 0 });
      const events = [this.event("Discarded", { playerId: PLAYER, tileId: hand.id, plan: PLANS.indexOf(hand.plan), points: result.points })];
      return result.over ? [...events, this.over()] : events;
    });
  }

  surrender(): Promise<WriteResult> {
    return this.write(() => {
      this.game.surrender();
      return [this.over()];
    });
  }

  /** A move made outside the session (another tab of the same player): the session's next prediction is stale. */
  async outsideDiscard(): Promise<void> {
    const hold = this.hold;
    this.hold = false;
    await this.discard();
    this.hold = hold;
  }

  /** The senders a page passes to the session for `move`. */
  senders() {
    return { build: (m: { orientation: number; x: number; y: number }) => () => this.build(m), discard: () => () => this.discard(), surrender: () => () => this.surrender() };
  }

  private async write(apply: () => DecodedEvent[]): Promise<WriteResult> {
    this.calls.push("write");
    if (this.refuseNext) {
      const error = this.refuseNext;
      this.refuseNext = null;
      throw error;
    }
    let events: DecodedEvent[];
    try {
      events = apply();
    } catch (error) {
      throw new WriteError((error as Error).message, "0xdead", true);
    }
    if (this.hold) await new Promise<void>((go) => this.waiting.push(go));
    return { transactionHash: `0x${this.calls.length.toString(16)}`, events };
  }

  private settle(id: number, patch: Partial<TileView>): void {
    const tile = this.drawn.find((t) => t.id === id)!;
    Object.assign(tile, patch);
    this.drawHand();
  }

  private drawHand(): void {
    const hand = this.game.hand;
    if (!this.game.over && hand && !this.drawn.some((t) => t.id === hand.id)) {
      this.drawn.push({ id: hand.id, status: TILE_STATUS.held, plan: PLANS.indexOf(hand.plan), orientation: 0, x: 0, y: 0 });
    }
  }

  private over(): DecodedEvent {
    return this.event("GameOver", { playerId: PLAYER, score: this.game.score, dayId: 0, endTime: 1 });
  }

  private event(name: string, fields: DecodedEvent["fields"]): DecodedEvent {
    return { name, fields: { gameId: this.key.gameId, ...fields }, fromAddress: "0x2" };
  }
}

/** A legal placement of the tile in hand on `game`, in the chain's coordinates; null when none. */
export function legalMove(game: EngineGame): { orientation: number; x: number; y: number } | null {
  const p = game.legalPlacements()[0];
  return p ? { orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } : null;
}
