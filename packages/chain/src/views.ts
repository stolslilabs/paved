import { shortString } from "starknet";
import type { Codecs, ContractName } from "./abis";
import { AbiMismatchError, type Encodable } from "./codec";
import type { Deployment } from "./deployment";

/** The two game contracts. Game ids are counted per contract, so a game is (mode, id). */
export type GameMode = "daily" | "tutorial";

export interface GameKey {
  mode: GameMode;
  gameId: number;
}

/** `mode` codes of the contracts (`public-interface.md`); 2 was Weekly and is never given again. */
export const MODE_CODE: Record<GameMode, number> = { daily: 1, tutorial: 3 };

export function modeFromCode(code: number): GameMode | null {
  if (code === 1) return "daily";
  if (code === 3) return "tutorial";
  return null;
}

export function gameContract(mode: GameMode): ContractName {
  return mode === "daily" ? "Daily" : "Tutorial";
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
  tournamentId: number;
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
  placedCount: number;
  availableCount: number;
}

export interface CharacterView {
  role: number;
  placed: boolean;
  tileId: number;
  x: number;
  y: number;
  spot: number;
}

export interface TournamentView {
  id: number;
  startTime: number;
  endTime: number;
  over: boolean;
  prize: bigint;
  top1PlayerId: string;
  top1Score: number;
  top1Claimed: boolean;
  top2PlayerId: string;
  top2Score: number;
  top2Claimed: boolean;
  top3PlayerId: string;
  top3Score: number;
  top3Claimed: boolean;
}

/** Field lists in ABI order; a test checks them against `contracts/abis/`. */
export const VIEW_FIELDS = {
  "paved::views::GameView": [
    "id", "playerId", "mode", "seed", "score", "over", "tileCount", "placedCount", "discardedCount",
    "tileId", "plan", "remainingCount", "deckSize", "startTime", "endTime", "tournamentId",
  ] satisfies (keyof GameView)[],
  "paved::views::TileView": ["id", "status", "plan", "orientation", "x", "y"] satisfies (keyof TileView)[],
  "paved::views::BuilderView": [
    "gameId", "playerId", "tileId", "plan", "placedCount", "availableCount",
  ] satisfies (keyof BuilderView)[],
  "paved::views::CharacterView": ["role", "placed", "tileId", "x", "y", "spot"] satisfies (keyof CharacterView)[],
  "paved::views::TournamentView": [
    "id", "startTime", "endTime", "over", "prize",
    "top1PlayerId", "top1Score", "top1Claimed",
    "top2PlayerId", "top2Score", "top2Claimed",
    "top3PlayerId", "top3Score", "top3Claimed",
  ] satisfies (keyof TournamentView)[],
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
  characters(key: GameKey, playerId: string): Promise<CharacterView[]>;
  currentTournamentId(): Promise<number>;
  tournament(id: number): Promise<TournamentView>;
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

  async characters(key: GameKey, playerId: string): Promise<CharacterView[]> {
    return (await this.call(gameContract(key.mode), "characters", [key.gameId, playerId])) as CharacterView[];
  }

  async currentTournamentId(): Promise<number> {
    return Number(await this.call("Daily", "current_tournament_id", []));
  }

  async tournament(id: number): Promise<TournamentView> {
    return (await this.call("Daily", "tournament", [id])) as TournamentView;
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
  characters: CharacterView[];
}

function gameKeyId(key: GameKey): string {
  return `${key.mode}:${key.gameId}`;
}

/** In-memory views with the contracts' error rules, for unit tests of the app. */
export class FakeGameViews implements GameViews {
  readonly games = new Map<string, FakeGame>();
  readonly tournaments = new Map<number, TournamentView>();
  currentTournament = 0;
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
    return { ...this.ownGame(key, playerId).builder };
  }

  async characters(key: GameKey, playerId: string): Promise<CharacterView[]> {
    this.calls.push(`characters ${gameKeyId(key)}`);
    return this.ownGame(key, playerId).characters.map((c) => ({ ...c }));
  }

  async currentTournamentId(): Promise<number> {
    this.calls.push("current_tournament_id");
    return this.currentTournament;
  }

  async tournament(id: number): Promise<TournamentView> {
    this.calls.push(`tournament ${id}`);
    return { ...(this.tournaments.get(id) ?? emptyTournament(id)) };
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

/** A tournament with no entry (what `tournament` returns for a day nobody played). */
export function emptyTournament(id: number): TournamentView {
  return {
    id,
    startTime: id * 86400,
    endTime: (id + 1) * 86400,
    over: false,
    prize: 0n,
    top1PlayerId: "0x0",
    top1Score: 0,
    top1Claimed: false,
    top2PlayerId: "0x0",
    top2Score: 0,
    top2Claimed: false,
    top3PlayerId: "0x0",
    top3Score: 0,
    top3Claimed: false,
  };
}
