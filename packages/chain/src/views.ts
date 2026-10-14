import { shortString } from "starknet";
import type { Codecs, ContractName } from "./abis";
import { AbiMismatchError, type Encodable } from "./codec";
import type { Deployment } from "./deployment";

/**
 * The game contract the client plays: Challenge (D-23, Daily before). The on-chain Tutorial left the contracts (D-21): the
 * tutorial is off chain (`/tutorial`). A game is still keyed (mode, id).
 */
export type GameMode = "challenge";

export interface GameKey {
  mode: GameMode;
  gameId: number;
}

/** `mode` codes of the contracts (`public-interface.md`); 2 was Weekly and 3 the Tutorial, never given again. */
export const MODE_CODE: Record<GameMode, number> = { challenge: 1 };

export function modeFromCode(code: number): GameMode | null {
  return code === 1 ? "challenge" : null;
}

export function gameContract(_mode: GameMode): ContractName {
  return "Challenge";
}

/** Field types and meanings: `docs/architecture/public-interface.md`. Felts are 0x-hex strings. */
export interface GameView {
  id: number;
  playerId: string;
  mode: number;
  seed: string;
  score: number;
  over: boolean;
  tileCount: number;
  placedCount: number;
  discardedCount: number;
  tileId: number;
  plan: number;
  remainingCount: number;
  deckSize: number;
  startTime: number;
  endTime: number;
  dayId: number;
}

/** `TileView.status` codes. */
export const TILE_STATUS = { placed: 1, discarded: 2, held: 3 } as const;

export interface TileView {
  id: number;
  status: number;
  plan: number;
  orientation: number;
  x: number;
  y: number;
}

export interface BuilderView {
  gameId: number;
  playerId: string;
  tileId: number;
  plan: number;
}

/** What a Challenge `spawn` pulls from the player: the ERC20 and the amount (`Challenge.entry_price`). */
export interface PriceView {
  token: string;
  amount: bigint;
}

/** Field lists in ABI order; a test checks them against `contracts/abis/`. */
export const VIEW_FIELDS = {
  "paved::views::GameView": [
    "id", "playerId", "mode", "seed", "score", "over", "tileCount", "placedCount", "discardedCount",
    "tileId", "plan", "remainingCount", "deckSize", "startTime", "endTime", "dayId",
  ] satisfies (keyof GameView)[],
  "paved::views::TileView": ["id", "status", "plan", "orientation", "x", "y"] satisfies (keyof TileView)[],
  "paved::views::BuilderView": ["gameId", "playerId", "tileId", "plan"] satisfies (keyof BuilderView)[],
  "paved::views::PriceView": ["token", "amount"] satisfies (keyof PriceView)[],
};

/** `abi-mismatch`: the contract answered with another layout than the ABI (an upgrade the client does not follow). */
export type ViewErrorKind = "game-not-found" | "not-player" | "not-configured" | "abi-mismatch" | "rpc";

/** A view that failed, with the reason the UI shows. */
export class ViewError extends Error {
  constructor(
    readonly kind: ViewErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ViewError";
  }
}

const REVERTS: Array<[string, ViewErrorKind]> = [
  ["Game: does not exist", "game-not-found"],
  ["View: not the game player", "not-player"],
];

/** Maps a failed call to a `ViewError`: the two reverts of the views by their message, the rest as `rpc`. */
export function toViewError(error: unknown): ViewError {
  if (error instanceof ViewError) return error;
  if (error instanceof AbiMismatchError) return new ViewError("abi-mismatch", error.message, error);
  const text = error instanceof Error ? error.message : String(error);
  const lower = text.toLowerCase();
  for (const [message, kind] of REVERTS) {
    // A node may give the revert reason as text or as the hex of its short string.
    const hex = shortString.encodeShortString(message).slice(2).toLowerCase();
    if (text.includes(message) || lower.includes(hex)) return new ViewError(kind, message, error);
  }
  return new ViewError("rpc", text, error);
}

/** The game-state reads. `RpcGameViews` calls the contracts; `FakeGameViews` is for tests. */
export interface GameViews {
  game(key: GameKey): Promise<GameView>;
  /** Every tile of the game, in id order (pages of `MAX_PAGE` until a short page). */
  tiles(key: GameKey): Promise<TileView[]>;
  builder(key: GameKey, playerId: string): Promise<BuilderView>;
  currentDay(): Promise<number>;
  /** The Challenge entry: token and amount, from the same source `spawn` uses. */
  entryPrice(): Promise<PriceView>;
  /** `Setup.tutorial_claimed(player_id)`: the player's tutorial claim is made (D-21). A `not-configured` ViewError without Setup. */
  tutorialClaimed(playerId: string): Promise<boolean>;
}

/** What the views need from starknet.js's `RpcProvider`. */
export interface CallProvider {
  callContract(call: { contractAddress: string; entrypoint: string; calldata: string[] }): Promise<string[]>;
}

export const MAX_PAGE = 64;

export class RpcGameViews implements GameViews {
  constructor(
    private readonly provider: CallProvider,
    private readonly deployment: Deployment,
    private readonly codecs: Codecs,
  ) {}

  async game(key: GameKey): Promise<GameView> {
    return (await this.call(gameContract(key.mode), "game", [key.gameId])) as GameView;
  }

  async tiles(key: GameKey): Promise<TileView[]> {
    const all: TileView[] = [];
    for (;;) {
      const page = (await this.call(gameContract(key.mode), "tiles", [key.gameId, all.length, MAX_PAGE])) as TileView[];
      all.push(...page);
      if (page.length < MAX_PAGE) return all;
    }
  }

  async builder(key: GameKey, playerId: string): Promise<BuilderView> {
    return (await this.call(gameContract(key.mode), "builder", [key.gameId, playerId])) as BuilderView;
  }

  async currentDay(): Promise<number> {
    return Number(await this.call("Challenge", "current_day", []));
  }

  async entryPrice(): Promise<PriceView> {
    return (await this.call("Challenge", "entry_price", [])) as PriceView;
  }

  async tutorialClaimed(playerId: string): Promise<boolean> {
    return (await this.call("Setup", "tutorial_claimed", [playerId])) as boolean;
  }

  private async call(contract: ContractName, entrypoint: string, args: Encodable[]): Promise<unknown> {
    const contractAddress = this.deployment.addresses[contract];
    if (!contractAddress) throw new ViewError("not-configured", `${contract} address is not configured`);
    const codec = this.codecs[contract];
    try {
      const felts = await this.provider.callContract({
        contractAddress,
        entrypoint,
        calldata: codec.encodeCall(entrypoint, args),
      });
      return codec.decodeResult(entrypoint, felts);
    } catch (error) {
      throw toViewError(error);
    }
  }
}

/** One game held by `FakeGameViews`. */
export interface FakeGame {
  game: GameView;
  tiles: TileView[];
  builder: BuilderView;
}

function gameKeyId(key: GameKey): string {
  return `${key.mode}:${key.gameId}`;
}

/** In-memory views with the contracts' error rules, for unit tests of the app. */
export class FakeGameViews implements GameViews {
  readonly games = new Map<string, FakeGame>();
  today = 0;
  price: PriceView = { token: "0x4", amount: 10n ** 18n };
  /** The players whose tutorial claim is made (`tutorial_claimed`), as BigInt. */
  readonly tutorialClaims = new Set<bigint>();
  calls: string[] = [];

  setGame(key: GameKey, game: FakeGame): void {
    this.games.set(gameKeyId(key), game);
  }

  async game(key: GameKey): Promise<GameView> {
    this.calls.push(`game ${gameKeyId(key)}`);
    return { ...this.get(key).game };
  }

  async tiles(key: GameKey): Promise<TileView[]> {
    this.calls.push(`tiles ${gameKeyId(key)}`);
    return this.get(key).tiles.map((t) => ({ ...t }));
  }

  async builder(key: GameKey, playerId: string): Promise<BuilderView> {
    this.calls.push(`builder ${gameKeyId(key)}`);
    const { gameId, playerId: player, tileId, plan } = this.ownGame(key, playerId).builder;
    return { gameId, playerId: player, tileId, plan };
  }

  async currentDay(): Promise<number> {
    this.calls.push("current_day");
    return this.today;
  }

  async entryPrice(): Promise<PriceView> {
    this.calls.push("entry_price");
    return { ...this.price };
  }

  async tutorialClaimed(playerId: string): Promise<boolean> {
    this.calls.push("tutorial_claimed");
    return this.tutorialClaims.has(BigInt(playerId));
  }

  private get(key: GameKey): FakeGame {
    const game = this.games.get(gameKeyId(key));
    if (!game) throw new ViewError("game-not-found", "Game: does not exist");
    return game;
  }

  private ownGame(key: GameKey, playerId: string): FakeGame {
    const game = this.get(key);
    if (BigInt(game.game.playerId) !== BigInt(playerId)) {
      throw new ViewError("not-player", "View: not the game player");
    }
    return game;
  }
}
