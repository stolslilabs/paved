// Local mock of the two endpoints the Game page talks to, for the in-play bench: Torii's SQL
// endpoint (POST /sql) and the Starknet JSON-RPC (POST /rpc). No network: the driver serves it
// from the same local server as the page.
//
// Responses are generated, not recorded (nothing is deployed to record from): rows of the
// 72-tile board fixture, in the shape Torii's SQL endpoint returns them (one JSON object per
// row; u8/u32 columns as integers, felts and addresses as 0x-prefixed 64-digit hex strings,
// bool as 0/1, plus Torii's internal_* columns). Each query is matched on its table only
// ([paved-Game], [paved-Builder], [paved-Tile], [paved-Char]); the WHERE clause is not
// evaluated (one game, one player). The RPC answers the calls the page makes (chain id, spec
// version, nonce, fee estimate, class of the account, token supply) with fixed values, and an
// invoke (`build`) succeeds at once and applies the next placement of the fixed sequence to
// the board, so the next poll sees it (a real Torii would see it a block later).
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface TileRow {
  game_id: number;
  id: number;
  player_id: string;
  plan: number;
  orientation: number;
  x: number;
  y: number;
  occupied_spot: number;
}

interface CharRow {
  game_id: number;
  player_id: string;
  index: number;
  tile_id: number;
  spot: number;
  weight: number;
  power: number;
}

/** Master account of the local profile (packages/chain/src/config.ts), as Torii stores it. */
const PLAYER = "0x0127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec";
const hex64 = (n: number | bigint) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const TILE_LIMIT = 100;

export interface MockCall {
  at: number;
  kind: "sql" | "rpc";
  what: string;
  bytes: number;
}

export function createMockChain(fixtures: string, size = 72) {
  const board = JSON.parse(readFileSync(join(fixtures, `board-${size}.json`), "utf8"));
  const sequence: TileRow[] = JSON.parse(readFileSync(join(fixtures, `placements-${size}.json`), "utf8")).placements;
  const gameId: number = board.tiles[0].game_id;
  const chars: CharRow[] = board.characters.map((c: CharRow) => ({ ...c, player_id: PLAYER }));
  let placed = 0;
  let nonce = 0;
  const calls: MockCall[] = [];
  const unknown = new Set<string>();
  const t0 = Date.parse("2026-10-06T08:00:00Z") / 1000;

  const internal = (key: string, i: number) => ({
    internal_id: hex64(BigInt(i + 1) * 0x9e3779b97f4a7c15n),
    internal_event_id: `0x${(0x1000 + i).toString(16)}:0x0000:0x${(i % 7).toString(16).padStart(4, "0")}`,
    internal_executed_at: new Date((t0 + i * 30) * 1000).toISOString().replace("T", " ").slice(0, 19),
    internal_created_at: new Date((t0 + i * 30) * 1000).toISOString().replace("T", " ").slice(0, 19),
    internal_updated_at: new Date((t0 + i * 30) * 1000).toISOString().replace("T", " ").slice(0, 19),
    internal_entity_id: hex64(BigInt(key.length * 7919 + i)),
  });

  const tileRows = () => {
    const placedTiles: TileRow[] = [...board.tiles, ...sequence.slice(0, placed)];
    const rows: Array<Record<string, unknown>> = placedTiles.map((t, i) => ({
      ...internal("Tile", i),
      game_id: t.game_id,
      id: t.id,
      player_id: PLAYER,
      plan: t.plan,
      orientation: t.orientation,
      x: t.x,
      y: t.y,
      occupied_spot: t.occupied_spot,
    }));
    // The tile in hand: drawn (plan known), not placed (orientation 0, no position).
    const current = sequence[placed];
    if (current) {
      rows.push({ ...internal("Tile", rows.length), game_id: gameId, id: current.id, player_id: PLAYER, plan: current.plan, orientation: 0, x: 0, y: 0, occupied_spot: 0 });
    }
    return rows;
  };

  const tables: Record<string, () => Array<Record<string, unknown>>> = {
    "paved-Game": () => [
      {
        id: gameId,
        over: 0,
        built: board.tiles.length + placed,
        discarded: 0,
        tile_count: board.tiles.length + placed + 1,
        tile_limit: TILE_LIMIT,
        score: 3 * (board.tiles.length + placed),
        mode: 1,
        tournament_id: 0,
        entry_multiplier_fp: 1_000_000,
        entry_supply_snapshot: hex64(10n ** 24n),
        entry_target_snapshot: hex64(2n * 10n ** 24n),
      },
    ],
    "paved-Builder": () => [
      { game_id: gameId, player_id: PLAYER, tile_id: sequence[placed]?.id ?? 0, characters: 0 },
    ],
    "paved-Tile": tileRows,
    "paved-Char": () => chars.map((c, i) => ({ ...internal("Char", i), ...c })),
  };

  const result = (id: unknown, value: unknown) => ({ jsonrpc: "2.0", id, result: value });

  function rpc(msg: { id: unknown; method: string; params?: any }) {
    switch (msg.method) {
      case "starknet_specVersion":
        return result(msg.id, "0.8.1");
      case "starknet_chainId":
        return result(msg.id, "0x4b4154414e41"); // KATANA
      case "starknet_getNonce":
        return result(msg.id, "0x" + nonce.toString(16));
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
      case "starknet_call":
        // Token totalSupply (u256 low, high): 1.5e24.
        return result(msg.id, [hex64(15n * 10n ** 23n), "0x0"]);
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
          block_hash: hex64(1000 + nonce),
          parent_hash: hex64(999 + nonce),
          block_number: 1000 + nonce,
          new_root: "0x0",
          timestamp: t0 + nonce,
          sequencer_address: "0x1",
          l1_gas_price: { price_in_fri: "0x1", price_in_wei: "0x1" },
          l2_gas_price: { price_in_fri: "0x1", price_in_wei: "0x1" },
          l1_data_gas_price: { price_in_fri: "0x1", price_in_wei: "0x1" },
          l1_da_mode: "BLOB",
          starknet_version: "0.13.5",
          // starknet.js estimates the tip from the V3 transactions of recent blocks (at least 10).
          transactions: Array.from({ length: 12 }, (_, i) =>
            msg.method === "starknet_getBlockWithTxs"
              ? { type: "INVOKE", version: "0x3", tip: "0x" + (1_000_000 + i * 1000).toString(16), transaction_hash: hex64(0xa000 + i), sender_address: "0x1", calldata: [], signature: [], nonce: "0x0", resource_bounds: {}, paymaster_data: [], account_deployment_data: [], nonce_data_availability_mode: "L1", fee_data_availability_mode: "L1" }
              : hex64(0xa000 + i),
          ),
        });
      case "starknet_addInvokeTransaction": {
        nonce++;
        const tx = msg.params?.invoke_transaction ?? msg.params?.[0] ?? {};
        const next = sequence[placed];
        const data: string[] = (tx.calldata ?? []).map((v: string) => BigInt(v).toString());
        // The build call carries the placement's x and y: apply it only if it is the expected one.
        if (next && data.includes(String(next.x)) && data.includes(String(next.y))) placed++;
        else console.warn(`mock-chain: invoke does not match placement ${placed} (${next?.x}, ${next?.y})`);
        return result(msg.id, { transaction_hash: hex64(0xbeef00 + nonce) });
      }
      default:
        unknown.add(msg.method);
        return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `mock-chain: no ${msg.method}` } };
    }
  }

  async function handle(req: Request, path: string): Promise<Response | null> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (path === "/sql") {
      const sql = await req.text();
      const table = /FROM \[([^\]]+)\]/.exec(sql)?.[1] ?? "?";
      const rows = tables[table]?.() ?? [];
      const body = JSON.stringify(rows);
      calls.push({ at: performance.now(), kind: "sql", what: table, bytes: body.length });
      return new Response(body, { headers: { "content-type": "application/json" } });
    }
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
    /** Back to the recorded board, before any placement. */
    reset() {
      placed = 0;
      nonce = 0;
      calls.length = 0;
      unknown.clear();
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
