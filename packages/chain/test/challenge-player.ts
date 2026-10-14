/**
 * A Challenge player for the end-to-end check on devnet (`e2e-devnet.test.ts`): it chooses each placement by asking the
 * node what it would do. Every candidate (an empty position next to the board and an orientation) is run with
 * `starknet_simulateTransactions` (validation and fee skipped, nothing is sent): a reverted simulation is an illegal
 * placement, and the `Scored` events of a legal one are the points it makes at once. The scoring rules are the
 * contract's own, so nothing here re-implements them.
 *
 * The strategy, deterministic (no randomness at all; ties go to the first candidate in a fixed order): the placement
 * that scores most at once, then the one with most neighbours (a compact board closes more structures). A wonder
 * scores when its 8 neighbours are taken, so its tile goes as close to the board's centre as the rules allow.
 * It looks one move ahead only: the next tile is drawn by the contract from the move played. Its cost is about 10 to
 * 80 simulations a move, a few seconds each move on a local devnet (the e2e's evidence gives the total).
 */
import { transaction, type Call } from "starknet";
import type { AbiCodec } from "../src/codec";
import type { PavedClient } from "../src/paved-client";
import { TILE_STATUS, type GameKey } from "../src/views";
import type { BuildMove, PavedWriter } from "../src/writer";

/** Plans 18 and 19 are the wonder tiles (`wffffffff`, `wfffffffr`). */
const WONDER_PLANS = new Set([18, 19]);
/** Simulations in flight at once (the node answers them in parallel). */
const CONCURRENCY = 4;
const DIRECTIONS: Array<[number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export interface PlayerContext {
  rpcUrl: string;
  client: PavedClient;
  challenge: string;
  codec: AbiCodec;
  address: string;
  writer: PavedWriter;
}

export interface PlayOptions {
  /** Stop after this many placements and surrender (a short game, below the threshold). */
  maxMoves?: number;
  /** Called after each placement. */
  onMove?: (line: string) => void;
}

export interface PlayResult {
  moves: number;
  discards: number;
  score: number;
  simulations: number;
  ms: number;
  hash: string;
}

interface Simulated {
  ok: boolean;
  points: number;
}

interface Candidate {
  move: BuildMove;
  points: number;
  neighbours: number;
  value: number;
}

async function rpc(url: string, method: string, params: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const toHex = (v: bigint | number) => `0x${BigInt(v).toString(16)}`;

export class ChallengePlayer {
  simulations = 0;
  private nonce = 0n;
  constructor(private readonly ctx: PlayerContext) {}

  private buildCall(key: GameKey, m: BuildMove): Call {
    return {
      contractAddress: this.ctx.challenge,
      entrypoint: "build",
      calldata: this.ctx.codec.encodeCall("build", [key.gameId, m.orientation, m.x, m.y]),
    };
  }

  /** Runs the move on the node's latest state, without sending: whether it is legal, and the points it makes. */
  async simulate(key: GameKey, move: BuildMove): Promise<Simulated> {
    this.simulations++;
    const txs = [move].map((m) => ({
      type: "INVOKE",
      version: "0x3",
      sender_address: this.ctx.address,
      calldata: transaction.getExecuteCalldata([this.buildCall(key, m)], "1").map((f) => toHex(BigInt(f))),
      signature: [],
      nonce: toHex(this.nonce),
      resource_bounds: {
        l1_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
        l2_gas: { max_amount: "0x3b9aca00", max_price_per_unit: "0x0" },
        l1_data_gas: { max_amount: "0x10000", max_price_per_unit: "0x0" },
      },
      tip: "0x0",
      paymaster_data: [],
      account_deployment_data: [],
      nonce_data_availability_mode: "L1",
      fee_data_availability_mode: "L1",
    }));
    let traces: any[];
    try {
      traces = await rpc(this.ctx.rpcUrl, "starknet_simulateTransactions", {
        block_id: "latest",
        transactions: txs,
        simulation_flags: ["SKIP_VALIDATE", "SKIP_FEE_CHARGE"],
      });
    } catch {
      return { ok: false, points: 0 };
    }
    let points = 0;
    for (const t of traces) {
      const exec = t.transaction_trace.execute_invocation;
      if (!exec || exec.revert_reason) return { ok: false, points: 0 };
    }
    const last = traces[0].transaction_trace.execute_invocation;
    const walk = (call: any) => {
      for (const e of call.events ?? []) {
        if (BigInt(call.contract_address) !== BigInt(this.ctx.challenge)) continue;
        const decoded = this.ctx.codec.decodeEvent({ keys: e.keys, data: e.data, from_address: call.contract_address } as any);
        if (decoded?.name !== "Scored") continue;
        points += Number(decoded.fields.points);
      }
      for (const inner of call.calls ?? []) walk(inner);
    };
    walk(last);
    return { ok: true, points };
  }

  /** The empty positions next to a placed tile, with their number of placed neighbours, in a fixed order. */
  private async frontier(key: GameKey): Promise<{ cells: Array<{ x: number; y: number; neighbours: number }>; center: { x: number; y: number } }> {
    const tiles = (await this.ctx.client.views.tiles(key)).filter((t) => t.status === TILE_STATUS.placed);
    const taken = new Set(tiles.map((t) => `${t.x},${t.y}`));
    const seen = new Map<string, { x: number; y: number; neighbours: number }>();
    for (const t of tiles) {
      for (const [dx, dy] of DIRECTIONS) {
        const x = t.x + dx;
        const y = t.y + dy;
        const id = `${x},${y}`;
        if (taken.has(id) || seen.has(id)) continue;
        let neighbours = 0;
        for (const [ex, ey] of DIRECTIONS) if (taken.has(`${x + ex},${y + ey}`)) neighbours++;
        seen.set(id, { x, y, neighbours });
      }
    }
    const cells = [...seen.values()].sort((a, b) => a.x - b.x || a.y - b.y);
    const n = tiles.length || 1;
    const center = { x: Math.round(tiles.reduce((s, t) => s + t.x, 0) / n), y: Math.round(tiles.reduce((s, t) => s + t.y, 0) / n) };
    return { cells, center };
  }

  /** Every legal placement of the tile in hand, one simulation per cell and orientation. */
  private async candidates(key: GameKey, cells: Array<{ x: number; y: number; neighbours: number }>): Promise<Candidate[]> {
    // The cells are probed `CONCURRENCY` at a time; the result keeps the cells' fixed order, so the choice does not
    // depend on which simulation answers first.
    const perCell = new Array<Candidate[]>(cells.length);
    let next = 0;
    const worker = async () => {
      while (next < cells.length) {
        const index = next++;
        perCell[index] = await this.cellCandidates(key, cells[index]);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return perCell.flat();
  }

  private async cellCandidates(key: GameKey, cell: { x: number; y: number; neighbours: number }): Promise<Candidate[]> {
    const out: Candidate[] = [];
    for (let orientation = 1; orientation <= 4; orientation++) {
      const move: BuildMove = { orientation, x: cell.x, y: cell.y };
      const sim = await this.simulate(key, move);
      if (sim.ok) out.push({ move, points: sim.points, neighbours: cell.neighbours, value: 0 });
    }
    return out;
  }

  /** Plays the game to its end (or `maxMoves` placements, then surrenders). */
  async play(key: GameKey, options: PlayOptions = {}): Promise<PlayResult> {
    const started = Date.now();
    const maxMoves = options.maxMoves ?? Number.POSITIVE_INFINITY;
    const views = this.ctx.client.views;
    let moves = 0;
    let discards = 0;
    let hash = "";
    for (let game = await views.game(key); !game.over && moves < maxMoves; game = await views.game(key)) {
      this.nonce = BigInt(await rpc(this.ctx.rpcUrl, "starknet_getNonce", { block_id: "latest", contract_address: this.ctx.address }));
      const { cells, center } = await this.frontier(key);
      const isWonder = WONDER_PLANS.has(game.plan);
      const candidates = await this.candidates(key, cells);
      const distance = (m: BuildMove) => Math.abs(m.x - center.x) + Math.abs(m.y - center.y);
      for (const c of candidates) {
        // Points first; then compactness; a wonder wants the middle of the board (its 8 neighbours must fill).
        c.value = c.points * 1000 + c.neighbours * 10 - (isWonder ? distance(c.move) * 20 : 0);
      }
      candidates.sort((a, b) => b.value - a.value);
      const chosen = candidates[0];
      if (chosen) {
        const result = await this.ctx.writer.build(key, chosen.move);
        hash = result.transactionHash;
        moves++;
        options.onMove?.(`move ${moves} ${JSON.stringify(chosen.move)} points ${chosen.points} value ${chosen.value} sims ${this.simulations}`);
      } else {
        hash = (await this.ctx.writer.discard(key)).transactionHash;
        discards++;
        options.onMove?.(`discard (no legal placement) sims ${this.simulations}`);
      }
    }
    let game = await views.game(key);
    if (!game.over) {
      hash = (await this.ctx.writer.surrender(key)).transactionHash;
      game = await views.game(key);
    }
    return { moves, discards, score: game.score, simulations: this.simulations, ms: Date.now() - started, hash };
  }
}
