// Local mock of the Starknet JSON-RPC (POST /rpc) the Game page talks to, for the in-play bench.
// No network: the driver serves it from the same local server as the page.
//
// It plays the native contracts (packages/chain, docs/architecture/client-data-layer.md) on the
// 72-tile board fixture: `starknet_call` answers the views (`game`, `tiles`, `builder`,
// `characters`, `tournament`, `current_tournament_id`, `entry_price`) and the reads (`player`, `balance_of`)
// with felts laid out as the ABIs of contracts/abis/ say; `starknet_getEvents` answers with no
// event (one game, opened by id). An invoke of `build` that carries the next placement of the
// fixed sequence applies it, and its receipt holds the events the client shows the move from
// (`Built`, `Scored`, and `GameOver` with the last placement of the sequence); the rest (chain
// id, nonce, fee estimate, account class, blocks for starknet.js's tip estimate) are fixed values.
//
// Strict: anything the bench does not expect is recorded in `violations` (a view of another game
// or player, a view the mock does not serve, an RPC method it does not know, a call in an invoke
// that is not `build`, a `build` that is not the next placement). A mismatched `build` is
// REVERTED, as the contract would revert a move it refuses, and nothing in its transaction is
// applied. The driver (run.ts) fails a session that recorded any.
//
// This file is not a standalone: like the page, it depends on the client workspace. It imports
// the codec of packages/chain and the addresses of packages/app-web/src/bench (relative paths),
// which need the workspace's `bun install` (starknet.js). The ABIs of contracts/abis/ are the
// layout it answers with: packages/app-web/__tests__/bench-mock-chain.test.ts decodes every
// answer with them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selector } from "../../packages/chain/src/codec";
import { BENCH_ADDRESSES } from "../../packages/app-web/src/bench/addresses";

interface TileRow {
  game_id: number;
  id: number;
  plan: number;
  orientation: number;
  x: number;
  y: number;
  occupied_spot: number;
}

interface CharRow {
  index: number;
  tile_id: number;
  spot: number;
}

/** The chain of the page (BENCH_ADDRESSES, one source): the four contracts and the playing account. */
export const BENCH = {
  Account: BigInt(BENCH_ADDRESSES.VITE_ACCOUNT_ADDRESS),
  Daily: BigInt(BENCH_ADDRESSES.VITE_DAILY_ADDRESS),
  Tutorial: BigInt(BENCH_ADDRESSES.VITE_TUTORIAL_ADDRESS),
  Token: BigInt(BENCH_ADDRESSES.VITE_TOKEN_ADDRESS),
  player: BigInt(BENCH_ADDRESSES.VITE_PLAYER_ADDRESS),
};
const hex = (n: number | bigint) => "0x" + BigInt(n).toString(16);
/** Deck size the mock reports: the 72-tile board and its placements fit. */
const DECK = 100;

export type ViolationKind =
  | "other-game"
  | "other-player"
  | "unknown-view"
  | "unknown-method"
  | "non-build-call"
  | "build-mismatch";

/** A call the bench does not expect from the page. */
export interface Violation {
  kind: ViolationKind;
  detail: string;
}

export interface MockCall {
  at: number;
  kind: "rpc";
  what: string;
  bytes: number;
}

export interface MockOptions {
  /** Self-test of the driver's checks: revert every `build`, as a contract that refuses all moves. */
  revertBuilds?: boolean;
}

export function createMockChain(fixtures: string, size = 72, options: MockOptions = {}) {
  const board = JSON.parse(readFileSync(join(fixtures, `board-${size}.json`), "utf8"));
  const sequence: TileRow[] = JSON.parse(readFileSync(join(fixtures, `placements-${size}.json`), "utf8")).placements;
  const gameId: number = board.tiles[0].game_id;
  const chars: CharRow[] = board.characters;
  let placed = 0;
  let nonce = 0;
  const calls: MockCall[] = [];
  const unknown = new Set<string>();
  const violations: Violation[] = [];
  const violate = (kind: ViolationKind, detail: string) => {
    violations.push({ kind, detail });
    console.warn(`mock-chain: ${kind}: ${detail}`);
  };
  /** Receipts by transaction hash. */
  const receipts = new Map<string, unknown>();
  const t0 = Date.parse("2026-10-06T08:00:00Z") / 1000;

  const SEL = Object.fromEntries(
    ["game", "tiles", "builder", "characters", "tournament", "current_tournament_id", "entry_price", "player", "balance_of", "build", "Built", "Scored", "GameOver"].map(
      (name) => [name, BigInt(selector(name))],
    ),
  );

  const onBoard = (): TileRow[] => [...board.tiles, ...sequence.slice(0, placed)];
  const inHand = (): TileRow | null => sequence[placed] ?? null;
  /** The game ends with the last placement of the sequence (a tournament_id of 0: it does not count). */
  const isOver = () => placed >= sequence.length;

  // ---- Views, encoded as the ABIs lay them out (structs flat, arrays length-prefixed) ----

  const gameView = () => {
    const hand = inHand();
    const count = onBoard().length;
    // id, player_id, mode, seed, score, over, tile_count, placed_count, discarded_count, tile_id,
    // plan, remaining_count, deck_size, start_time, end_time, tournament_id
    return [gameId, BENCH.player, 1, 0x5eed, 3 * count, isOver() ? 1 : 0, count + (hand ? 1 : 0), count, 0, hand?.id ?? 0, hand?.plan ?? 0, DECK - count - 1, DECK, t0, isOver() ? t0 + placed : 0, 0];
  };

  const tilesView = (from: number, count: number) => {
    const all = [
      ...onBoard().map((t) => [t.id, 1, t.plan, t.orientation, t.x, t.y]),
      ...(inHand() ? [[inHand()!.id, 3, inHand()!.plan, 0, 0, 0]] : []),
    ];
    const page = all.slice(from, from + Math.min(count, 64));
    return [page.length, ...page.flat()];
  };

  const charactersView = () => {
    const tiles = new Map(onBoard().map((t) => [t.id, t]));
    const rows = [1, 2, 3, 4, 5].map((role) => {
      const c = chars.find((ch) => ch.index === role);
      const t = c && tiles.get(c.tile_id);
      return c && t ? [role, 1, c.tile_id, t.x, t.y, c.spot] : [role, 0, 0, 0, 0, 0];
    });
    return [rows.length, ...rows.flat()];
  };

  const builderView = () => {
    const hand = inHand();
    const placedChars = charactersView().slice(1).filter((_, i) => i % 6 === 1 && _ === 1).length;
    return [gameId, BENCH.player, hand?.id ?? 0, hand?.plan ?? 0, placedChars, 5 - placedChars];
  };

  /** The view as the page asked it, after the checks of what the bench expects: this game, this player. */
  const call = (to: bigint, entry: bigint, args: bigint[]): Array<number | bigint> => {
    const daily = to === BENCH.Daily;
    const what = `${hex(entry)}(${args.map(hex).join(", ")}) on ${hex(to)}`;
    if (daily && [SEL.game, SEL.tiles, SEL.builder, SEL.characters].includes(entry) && args[0] !== BigInt(gameId)) {
      violate("other-game", `${what}, the game is ${gameId}`);
    }
    if (daily && [SEL.builder, SEL.characters].includes(entry) && args[1] !== BENCH.player) {
      violate("other-player", `${what}, the player is ${hex(BENCH.player)}`);
    }
    if (to === BENCH.Account && entry === SEL.player && args[0] !== BENCH.player) violate("other-player", `player(${hex(args[0])})`);
    if (to === BENCH.Token && entry === SEL.balance_of && args[0] !== BENCH.player) violate("other-player", `balance_of(${hex(args[0])})`);

    if (daily && entry === SEL.game) return gameView();
    if (daily && entry === SEL.tiles) return tilesView(Number(args[1]), Number(args[2]));
    if (daily && entry === SEL.builder) return builderView();
    if (daily && entry === SEL.characters) return charactersView();
    if (daily && entry === SEL.current_tournament_id) return [Math.floor(t0 / 86400)];
    if (daily && entry === SEL.tournament) {
      const id = Number(args[0]);
      return [id, id * 86400, (id + 1) * 86400, 0, 10n ** 18n, 0, BENCH.player, 3 * onBoard().length, 0, 0, 0, 0, 0, 0, 0];
    }
    if (daily && entry === SEL.entry_price) return [BENCH.Token, 10n ** 18n, 0]; // token, u256 amount
    if (to === BENCH.Account && entry === SEL.player) return [args[0], 0x5061766564, args[0]]; // 'Paved'
    if (to === BENCH.Token && entry === SEL.balance_of) return [10n ** 21n, 0];
    const message = `no view ${hex(entry)} on ${hex(to)}`;
    violate("unknown-view", message);
    throw new Error(`mock-chain: ${message}`);
  };

  // ---- Writes: the account's multicall, [n, (to, selector, len, ...calldata)*] ----

  type Event = { from_address: string; keys: string[]; data: string[] };

  /**
   * Runs a multicall. Every call must be a `build` that is the next placement in turn; one that is
   * not is recorded, and the whole transaction is reverted (nothing applied, no event).
   */
  const invoke = (calldata: bigint[]): string => {
    nonce++;
    const hash = hex(0xbeef00 + nonce);
    const events: Event[] = [];
    const accepted: Array<{ tile: TileRow; role: number; spot: number }> = [];
    let reverted: string | null = null;
    const count = Number(calldata[0] ?? 0n);
    if (count === 0) {
      violate("non-build-call", "empty multicall");
      reverted = "no call";
    }
    let at = 1;
    for (let k = 0; k < count; k++) {
      const [to, entry, len] = [calldata[at], calldata[at + 1], Number(calldata[at + 2])];
      const args = calldata.slice(at + 3, at + 3 + len);
      at += 3 + len;
      if (to !== BENCH.Daily || entry !== SEL.build) {
        violate("non-build-call", `${hex(to)}.${hex(entry)}`);
        reverted ??= `not a build: ${hex(to)}.${hex(entry)}`;
        continue;
      }
      const [game, orientation, x, y, role, spot] = args.map(Number);
      const next = sequence[placed + accepted.length];
      if (next && game === gameId && x === next.x && y === next.y && orientation === next.orientation) {
        accepted.push({ tile: next, role, spot });
      } else {
        const want = next ? `(${next.x}, ${next.y}, orientation ${next.orientation})` : "none, the sequence is over";
        violate("build-mismatch", `game ${game} at (${x}, ${y}) orientation ${orientation}; placement ${placed + accepted.length} is ${want} of game ${gameId}`);
        reverted ??= "Game: move does not match";
      }
    }
    if (options.revertBuilds) reverted ??= "bench self-test: every build is refused";
    if (!reverted) {
      for (const { tile, role, spot } of accepted) {
        placed++;
        const from_address = hex(BENCH.Daily);
        events.push({
          from_address,
          keys: [hex(SEL.Built), hex(gameId)],
          data: [BENCH.player, tile.id, tile.plan, tile.orientation, tile.x, tile.y, role, spot].map(hex),
        });
        // category, size, points: the mock scores 3 points per tile, as its game view says.
        events.push({ from_address, keys: [hex(SEL.Scored), hex(gameId)], data: [BENCH.player, 1, 1, 3].map(hex) });
        if (isOver()) {
          events.push({
            from_address,
            keys: [hex(SEL.GameOver), hex(gameId), hex(BENCH.player), hex(0)],
            data: [1, 3 * onBoard().length, t0, t0 + placed].map(hex),
          });
        }
      }
    }
    receipts.set(hash, {
      type: "INVOKE",
      transaction_hash: hash,
      actual_fee: { amount: "0x1", unit: "FRI" },
      execution_status: reverted ? "REVERTED" : "SUCCEEDED",
      ...(reverted ? { revert_reason: reverted } : {}),
      finality_status: "ACCEPTED_ON_L2",
      block_hash: hex(1000 + nonce),
      block_number: 1000 + nonce,
      messages_sent: [],
      events,
      execution_resources: { l1_gas: 0, l1_data_gas: 256, l2_gas: 0x200000 },
    });
    return hash;
  };

  const result = (id: unknown, value: unknown) => ({ jsonrpc: "2.0", id, result: value });
  const failure = (id: unknown, message: string) => ({ jsonrpc: "2.0", id, error: { code: 40, message: "Contract error", data: { revert_error: message } } });

  function rpc(msg: { id: unknown; method: string; params?: any }) {
    switch (msg.method) {
      case "starknet_specVersion":
        return result(msg.id, "0.8.1");
      case "starknet_chainId":
        return result(msg.id, "0x534e5f4445564e4554"); // SN_DEVNET
      case "starknet_getNonce":
        return result(msg.id, hex(nonce));
      case "starknet_blockNumber":
        return result(msg.id, 1000 + nonce);
      case "starknet_getClassHashAt":
        return result(msg.id, "0x05400e90f7e0ae78bd02c77cd75527280470e2fe19c54970dd79dc37a9d3645c");
      case "starknet_getClassAt":
      case "starknet_getClass":
        return result(msg.id, {
          sierra_program: ["0x1", "0x7", "0x0"],
          contract_class_version: "0.1.0",
          entry_points_by_type: { CONSTRUCTOR: [], EXTERNAL: [], L1_HANDLER: [] },
          abi: "[]",
        });
      case "starknet_call": {
        const req = msg.params?.request ?? msg.params?.[0] ?? {};
        try {
          const out = call(BigInt(req.contract_address), BigInt(req.entry_point_selector), (req.calldata ?? []).map(BigInt));
          return result(msg.id, out.map(hex));
        } catch (error) {
          return failure(msg.id, String(error));
        }
      }
      case "starknet_getEvents":
        return result(msg.id, { events: [] });
      case "starknet_estimateFee":
        return result(
          msg.id,
          (msg.params?.request ?? msg.params?.[0] ?? [{}]).map(() => ({
            l1_gas_consumed: "0x0",
            l1_gas_price: "0x1",
            l2_gas_consumed: "0x200000",
            l2_gas_price: "0x1",
            l1_data_gas_consumed: "0x100",
            l1_data_gas_price: "0x1",
            overall_fee: "0x200100",
            unit: "FRI",
          })),
        );
      case "starknet_getBlockWithTxHashes":
      case "starknet_getBlockWithTxs":
        return result(msg.id, {
          status: "ACCEPTED_ON_L2",
          block_hash: hex(1000 + nonce),
          parent_hash: hex(999 + nonce),
          block_number: 1000 + nonce,
          new_root: "0x0",
          timestamp: t0 + nonce,
          sequencer_address: "0x1",
          l1_gas_price: { price_in_fri: "0x1", price_in_wei: "0x1" },
          l2_gas_price: { price_in_fri: "0x1", price_in_wei: "0x1" },
          l1_data_gas_price: { price_in_fri: "0x1", price_in_wei: "0x1" },
          l1_da_mode: "BLOB",
          starknet_version: "0.13.5",
          // starknet.js estimates the tip from the V3 transactions of recent blocks (at least 10),
          // when no tip is given; the bench's writer gives tip 0, this stays for safety.
          transactions: Array.from({ length: 12 }, (_, i) =>
            msg.method === "starknet_getBlockWithTxs"
              ? { type: "INVOKE", version: "0x3", tip: hex(1_000_000 + i * 1000), transaction_hash: hex(0xa000 + i), sender_address: "0x1", calldata: [], signature: [], nonce: "0x0", resource_bounds: {}, paymaster_data: [], account_deployment_data: [], nonce_data_availability_mode: "L1", fee_data_availability_mode: "L1" }
              : hex(0xa000 + i),
          ),
        });
      case "starknet_addInvokeTransaction": {
        const tx = msg.params?.invoke_transaction ?? msg.params?.[0] ?? {};
        return result(msg.id, { transaction_hash: invoke((tx.calldata ?? []).map(BigInt)) });
      }
      case "starknet_getTransactionStatus": {
        const hash = msg.params?.transaction_hash ?? msg.params?.[0];
        if (!receipts.has(hash)) return { jsonrpc: "2.0", id: msg.id, error: { code: 29, message: "Transaction hash not found" } };
        const { execution_status, revert_reason } = receipts.get(hash) as { execution_status: string; revert_reason?: string };
        return result(msg.id, { finality_status: "ACCEPTED_ON_L2", execution_status, ...(revert_reason ? { revert_reason } : {}) });
      }
      case "starknet_getTransactionReceipt": {
        const hash = msg.params?.transaction_hash ?? msg.params?.[0];
        const receipt = receipts.get(hash);
        if (!receipt) return { jsonrpc: "2.0", id: msg.id, error: { code: 29, message: "Transaction hash not found" } };
        return result(msg.id, receipt);
      }
      default:
        unknown.add(msg.method);
        violate("unknown-method", msg.method);
        return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `mock-chain: no ${msg.method}` } };
    }
  }

  async function handle(req: Request, path: string): Promise<Response | null> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (path === "/rpc") {
      const msg = await req.json();
      const out = Array.isArray(msg) ? msg.map(rpc) : rpc(msg);
      const body = JSON.stringify(out);
      calls.push({ at: performance.now(), kind: "rpc", what: Array.isArray(msg) ? msg.map((m) => m.method).join("+") : msg.method, bytes: body.length });
      return new Response(body, { headers: { "content-type": "application/json" } });
    }
    return null;
  }

  return {
    handle,
    /** For tests: one JSON-RPC message, answered as `handle` would. */
    rpc,
    /** Back to the recorded board, before any placement. */
    reset() {
      placed = 0;
      nonce = 0;
      calls.length = 0;
      unknown.clear();
      violations.length = 0;
      receipts.clear();
    },
    /** The next placement of the sequence (contract coordinates), or null at its end. */
    next: (): TileRow | null => sequence[placed] ?? null,
    get placed() {
      return placed;
    },
    /** The id of the one game the mock serves. */
    gameId,
    calls,
    unknown,
    /** Every unexpected call since the last `reset` (see the head of this file). */
    violations,
  };
}

export type MockChain = ReturnType<typeof createMockChain>;
