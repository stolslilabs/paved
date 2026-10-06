// Local mock of the Starknet JSON-RPC (POST /rpc) the Game page talks to, for the in-play bench.
// No network: the driver serves it from the same local server as the page.
//
// It plays the native contracts (packages/chain, docs/architecture/client-data-layer.md) on the
// 72-tile board fixture: `starknet_call` answers the views (`game`, `tiles`, `builder`,
// `characters`, `tournament`, `current_tournament_id`, `entry_price`) and the reads (`player`, `balance_of`)
// with felts laid out as the ABIs of contracts/abis/ say; `starknet_getEvents` answers with no
// event (one game, opened by id). An invoke of `build` that carries the next placement of the
// fixed sequence applies it, and its receipt holds the `Built` event the client shows the tile
// from; the rest (chain id, nonce, fee estimate, account class, blocks for starknet.js's tip
// estimate) are fixed values.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selector } from "../../packages/chain/src/codec";

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

/**
 * The chain of packages/app-web/src/bench/play.tsx (BENCH_ADDRESSES): the four contracts and
 * the playing account.
 */
export const BENCH = {
  Account: 0x1an,
  Daily: 0x2an,
  Tutorial: 0x3an,
  Token: 0x4an,
  player: 0x5an,
};
const hex = (n: number | bigint) => "0x" + BigInt(n).toString(16);
/** Deck size the mock reports: the 72-tile board and its placements fit. */
const DECK = 100;

export interface MockCall {
  at: number;
  kind: "rpc";
  what: string;
  bytes: number;
}

export function createMockChain(fixtures: string, size = 72) {
  const board = JSON.parse(readFileSync(join(fixtures, `board-${size}.json`), "utf8"));
  const sequence: TileRow[] = JSON.parse(readFileSync(join(fixtures, `placements-${size}.json`), "utf8")).placements;
  const gameId: number = board.tiles[0].game_id;
  const chars: CharRow[] = board.characters;
  let placed = 0;
  let nonce = 0;
  const calls: MockCall[] = [];
  const unknown = new Set<string>();
  /** Receipts by transaction hash. */
  const receipts = new Map<string, unknown>();
  const t0 = Date.parse("2026-10-06T08:00:00Z") / 1000;

  const SEL = Object.fromEntries(
    ["game", "tiles", "builder", "characters", "tournament", "current_tournament_id", "entry_price", "player", "balance_of", "build", "Built"].map(
      (name) => [name, BigInt(selector(name))],
    ),
  );

  const onBoard = (): TileRow[] => [...board.tiles, ...sequence.slice(0, placed)];
  const inHand = (): TileRow | null => sequence[placed] ?? null;

  // ---- Views, encoded as the ABIs lay them out (structs flat, arrays length-prefixed) ----

  const gameView = () => {
    const hand = inHand();
    const count = onBoard().length;
    // id, player_id, mode, seed, score, over, tile_count, placed_count, discarded_count, tile_id,
    // plan, remaining_count, deck_size, start_time, end_time, tournament_id
    return [gameId, BENCH.player, 1, 0x5eed, 3 * count, 0, count + (hand ? 1 : 0), count, 0, hand?.id ?? 0, hand?.plan ?? 0, DECK - count - 1, DECK, t0, 0, 0];
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

  const call = (to: bigint, entry: bigint, args: bigint[]): Array<number | bigint> => {
    if (to === BENCH.Daily && entry === SEL.game) return gameView();
    if (to === BENCH.Daily && entry === SEL.tiles) return tilesView(Number(args[1]), Number(args[2]));
    if (to === BENCH.Daily && entry === SEL.builder) return builderView();
    if (to === BENCH.Daily && entry === SEL.characters) return charactersView();
    if (to === BENCH.Daily && entry === SEL.current_tournament_id) return [Math.floor(t0 / 86400)];
    if (to === BENCH.Daily && entry === SEL.tournament) {
      const id = Number(args[0]);
      return [id, id * 86400, (id + 1) * 86400, 0, 10n ** 18n, 0, BENCH.player, 3 * onBoard().length, 0, 0, 0, 0, 0, 0, 0];
    }
    if (to === BENCH.Daily && entry === SEL.entry_price) return [BENCH.Token, 10n ** 18n, 0]; // token, u256 amount
    if (to === BENCH.Account && entry === SEL.player) return [args[0], 0x5061766564, args[0]]; // 'Paved'
    if (to === BENCH.Token && entry === SEL.balance_of) return [10n ** 21n, 0];
    throw new Error(`mock-chain: no view ${hex(entry)} on ${hex(to)}`);
  };

  // ---- Writes: the account's multicall, [n, (to, selector, len, ...calldata)*] ----

  const invoke = (calldata: bigint[]): string => {
    nonce++;
    const hash = hex(0xbeef00 + nonce);
    const events: Array<{ from_address: string; keys: string[]; data: string[] }> = [];
    let at = 1;
    for (let k = 0; k < Number(calldata[0] ?? 0n); k++) {
      const [to, entry, len] = [calldata[at], calldata[at + 1], Number(calldata[at + 2])];
      const args = calldata.slice(at + 3, at + 3 + len);
      at += 3 + len;
      if (to !== BENCH.Daily || entry !== SEL.build) continue;
      const [game, orientation, x, y, role, spot] = args.map(Number);
      const next = inHand();
      // Apply the build only if it is the expected next placement.
      if (next && game === gameId && x === next.x && y === next.y && orientation === next.orientation) {
        placed++;
        events.push({
          from_address: hex(BENCH.Daily),
          keys: [hex(SEL.Built), hex(gameId)],
          data: [BENCH.player, next.id, next.plan, orientation, x, y, role, spot].map(hex),
        });
      } else {
        console.warn(`mock-chain: build does not match placement ${placed} (${next?.x}, ${next?.y}, orientation ${next?.orientation})`);
      }
    }
    receipts.set(hash, {
      type: "INVOKE",
      transaction_hash: hash,
      actual_fee: { amount: "0x1", unit: "FRI" },
      execution_status: "SUCCEEDED",
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
        return result(msg.id, { finality_status: "ACCEPTED_ON_L2", execution_status: "SUCCEEDED" });
      }
      case "starknet_getTransactionReceipt": {
        const hash = msg.params?.transaction_hash ?? msg.params?.[0];
        const receipt = receipts.get(hash);
        if (!receipt) return { jsonrpc: "2.0", id: msg.id, error: { code: 29, message: "Transaction hash not found" } };
        return result(msg.id, receipt);
      }
      default:
        unknown.add(msg.method);
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
      receipts.clear();
    },
    /** The next placement of the sequence (contract coordinates), or null at its end. */
    next: (): TileRow | null => sequence[placed] ?? null,
    get placed() {
      return placed;
    },
    calls,
    unknown,
  };
}

export type MockChain = ReturnType<typeof createMockChain>;
