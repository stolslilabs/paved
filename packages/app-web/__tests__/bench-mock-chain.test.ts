import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCodecs, placementOutcome, receiptEvents } from "@paved/chain";
import type { DecodedEvent } from "@paved/chain";
import { selector } from "../../chain/src/codec";
import { BENCH, createMockChain } from "../../../scripts/bench/mock-chain";
import type { MockOptions } from "../../../scripts/bench/mock-chain";
import { BENCH_ADDRESSES } from "../src/bench/addresses";

// The mock of the in-play bench answers the page with felts laid out by hand. These tests read
// every answer back with the codecs of the real ABIs (contracts/abis/), the page's own decoders,
// so a change of the ABIs that the mock does not follow fails here and not in a bench run.

const fixtures = new URL("../../game-core/bench/fixtures", import.meta.url).pathname;
const codecs = createCodecs();
const hex = (n: number | bigint | string) => "0x" + BigInt(n).toString(16);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

function setup(options?: MockOptions) {
  const mock = createMockChain(fixtures, 72, options);
  let id = 0;
  const rpc = (method: string, params: unknown) => mock.rpc({ id: ++id, method, params }) as any;
  /** `starknet_call` of a view, decoded with the ABI of its contract. */
  const view = (contract: "Daily" | "Account" | "Token", to: bigint, name: string, args: Array<string | number | bigint | boolean> = []) => {
    const out = rpc("starknet_call", {
      request: { contract_address: hex(to), entry_point_selector: selector(name), calldata: codecs[contract].encodeCall(name, args) },
      block_id: "latest",
    });
    if (out.error) throw new Error(out.error.data?.revert_error ?? out.error.message);
    return codecs[contract].decodeResult(name, out.result) as any;
  };
  const daily = (name: string, args: Array<string | number | bigint | boolean> = []) => view("Daily", BENCH.Daily, name, args);
  const gameId = mock.gameId;
  /** An invoke of a multicall of calls [to, entry name, calldata]; returns the receipt. */
  const invoke = (calls: Array<[bigint, string, Array<string | number | bigint>]>) => {
    const calldata = [calls.length, ...calls.flatMap(([to, name, args]) => [to, BigInt(selector(name)), args.length, ...args])].map(hex);
    const { result } = rpc("starknet_addInvokeTransaction", { invoke_transaction: { calldata } });
    const hash = result.transaction_hash as string;
    return { hash, receipt: rpc("starknet_getTransactionReceipt", { transaction_hash: hash }).result, status: rpc("starknet_getTransactionStatus", { transaction_hash: hash }).result };
  };
  /** The `build` of the placement the mock expects next, or with changes. */
  const build = (over: Partial<{ game: number; orientation: number; x: number; y: number }> = {}) => {
    const next = mock.next()!;
    return [BENCH.Daily, "build", [over.game ?? gameId, over.orientation ?? next.orientation, over.x ?? next.x, over.y ?? next.y, 0, 0]] as [bigint, string, number[]];
  };
  const events = (receipt: any): DecodedEvent[] => receiptEvents(receipt, codecs, "Daily", hex(BENCH.Daily));
  return { mock, rpc, view, daily, gameId, invoke, build, events };
}

describe("addresses", () => {
  it("are the ones of the page, one source", () => {
    expect(BENCH.Account).toBe(BigInt(BENCH_ADDRESSES.VITE_ACCOUNT_ADDRESS));
    expect(BENCH.Daily).toBe(BigInt(BENCH_ADDRESSES.VITE_DAILY_ADDRESS));
    expect(BENCH.Tutorial).toBe(BigInt(BENCH_ADDRESSES.VITE_TUTORIAL_ADDRESS));
    expect(BENCH.Token).toBe(BigInt(BENCH_ADDRESSES.VITE_TOKEN_ADDRESS));
    expect(BENCH.player).toBe(BigInt(BENCH_ADDRESSES.VITE_PLAYER_ADDRESS));
  });
});

describe("views, decoded with the real ABIs", () => {
  it("game", () => {
    const { daily, gameId, mock } = setup();
    const g = daily("game", [gameId]);
    expect(Number(g.id)).toBe(gameId);
    expect(BigInt(g.playerId)).toBe(BENCH.player);
    expect(Number(g.mode)).toBe(1);
    expect(g.over).toBe(false);
    expect(Number(g.placedCount)).toBe(72);
    expect(Number(g.tileId)).toBe(mock.next()!.id);
    expect(Number(g.deckSize)).toBeGreaterThan(Number(g.tileCount));
  });

  it("tiles: the placed tiles, then the tile in hand, in pages", () => {
    const { daily, gameId, mock } = setup();
    const page = daily("tiles", [gameId, 0, 64]);
    expect(page).toHaveLength(64);
    const rest = daily("tiles", [gameId, 64, 64]);
    expect(rest).toHaveLength(73 - 64);
    expect(rest.at(-1)).toMatchObject({ status: 3, id: mock.next()!.id });
    expect(page.every((t: any) => t.status === 1)).toBe(true);
  });

  it("builder, characters, tournament, entry_price, player and balance_of", () => {
    const { daily, view, gameId, mock } = setup();
    const b = daily("builder", [gameId, BENCH.player]);
    expect(Number(b.gameId)).toBe(gameId);
    expect(Number(b.tileId)).toBe(mock.next()!.id);
    expect(Number(b.placedCount) + Number(b.availableCount)).toBe(5);
    const chars = daily("characters", [gameId, BENCH.player]);
    expect(chars.map((c: any) => Number(c.role))).toEqual([1, 2, 3, 4, 5]);
    expect(chars.filter((c: any) => c.placed)).toHaveLength(Number(b.placedCount));
    const id = daily("current_tournament_id");
    expect(Number(daily("tournament", [id]).id)).toBe(Number(id));
    const price = daily("entry_price");
    expect(BigInt(price.token)).toBe(BENCH.Token);
    expect(BigInt(price.amount)).toBeGreaterThan(0n);
    expect(BigInt(view("Account", BENCH.Account, "player", [BENCH.player]).address ?? BENCH.player)).toBe(BENCH.player);
    expect(BigInt(view("Token", BENCH.Token, "balance_of", [BENCH.player]))).toBeGreaterThan(0n);
  });

  it("no view leaves felts over or short: each decodes whole", () => {
    // decodeResult refuses leftover felts and short reads (AbiMismatchError): the calls above passed it.
    const { daily, gameId } = setup();
    expect(() => daily("game", [gameId])).not.toThrow();
    expect(() => daily("tiles", [gameId, 0, 1])).not.toThrow();
  });
});

describe("a build of the next placement", () => {
  it("succeeds, and its receipt holds Built and Scored, read back with the ABI", () => {
    const { mock, invoke, build, events, gameId, daily } = setup();
    const next = mock.next()!;
    const { receipt, status } = invoke([build()]);
    expect(receipt.execution_status).toBe("SUCCEEDED");
    expect(status.execution_status).toBe("SUCCEEDED");
    const out = placementOutcome(events(receipt), gameId);
    expect(out.built).toMatchObject({ tileId: next.id, plan: next.plan, orientation: next.orientation, x: next.x, y: next.y });
    expect(out.scored).toEqual([{ category: 1, size: 1, points: 3 }]);
    expect(out.over).toBeNull();
    expect(mock.placed).toBe(1);
    expect(mock.violations).toEqual([]);
    expect(Number(daily("game", [gameId]).placedCount)).toBe(73);
  });

  it("ends the game with the last placement: GameOver in the receipt, over in the view", () => {
    const { mock, invoke, build, events, gameId, daily } = setup();
    let last: any;
    while (mock.next()) last = invoke([build()]).receipt;
    expect(mock.violations).toEqual([]);
    const out = placementOutcome(events(last), gameId);
    expect(out.over).toMatchObject({ tournamentId: 0 });
    expect(out.over!.score).toBeGreaterThan(0);
    const names = events(last).map((e) => e.name);
    expect(names).toEqual(["Built", "Scored", "GameOver"]);
    expect(daily("game", [gameId]).over).toBe(true);
  });
});

describe("what the bench does not expect", () => {
  it("reverts a build that is not the next placement, applies nothing, and records it", () => {
    const { mock, invoke, build, events } = setup();
    const next = mock.next()!;
    for (const wrong of [{ x: next.x + 1 }, { y: next.y + 1 }, { orientation: (next.orientation + 1) % 4 }, { game: 999 }]) {
      const { receipt, status } = invoke([build(wrong)]);
      expect(receipt.execution_status).toBe("REVERTED");
      expect(receipt.revert_reason).toBeTruthy();
      expect(status.execution_status).toBe("REVERTED");
      expect(events(receipt)).toEqual([]);
    }
    expect(mock.placed).toBe(0);
    expect(mock.violations.map((v) => v.kind)).toEqual(["build-mismatch", "build-mismatch", "build-mismatch", "build-mismatch"]);
  });

  it("reverts the whole multicall when one call is not a build, even next to a good build", () => {
    const { mock, invoke, build } = setup();
    const { receipt } = invoke([build(), [BENCH.Token, "approve", [BENCH.Daily, 1, 0]]]);
    expect(receipt.execution_status).toBe("REVERTED");
    expect(mock.placed).toBe(0);
    expect(mock.violations.map((v) => v.kind)).toEqual(["non-build-call"]);
  });

  it("records a view of another game or another player", () => {
    const { mock, view, gameId } = setup();
    view("Daily", BENCH.Daily, "game", [gameId + 1]); // answered, but recorded
    view("Daily", BENCH.Daily, "builder", [gameId, 0x7777]);
    view("Daily", BENCH.Daily, "characters", [gameId, 0x7777]);
    view("Token", BENCH.Token, "balance_of", [0x7777]);
    expect(mock.violations.map((v) => v.kind)).toEqual(["other-game", "other-player", "other-player", "other-player"]);
  });

  it("records a view it does not serve, and fails it", () => {
    const { mock, rpc } = setup();
    const out = rpc("starknet_call", { request: { contract_address: hex(BENCH.Daily), entry_point_selector: selector("sponsor_pool"), calldata: [] } });
    expect(out.error).toBeDefined();
    const other = rpc("starknet_call", { request: { contract_address: hex(0x99), entry_point_selector: selector("game"), calldata: ["0x1"] } });
    expect(other.error).toBeDefined();
    expect(mock.violations.map((v) => v.kind)).toEqual(["unknown-view", "unknown-view"]);
  });

  it("records an RPC method it does not know", () => {
    const { mock, rpc } = setup();
    expect(rpc("starknet_traceTransaction", {}).error).toBeDefined();
    expect(mock.violations).toEqual([{ kind: "unknown-method", detail: "starknet_traceTransaction" }]);
    expect([...mock.unknown]).toEqual(["starknet_traceTransaction"]);
  });

  it("reset forgets the violations and the placements", () => {
    const { mock, invoke, build } = setup();
    invoke([build()]);
    invoke([build({ x: 12345 })]);
    expect(mock.violations).toHaveLength(1);
    mock.reset();
    expect(mock.violations).toEqual([]);
    expect(mock.placed).toBe(0);
  });

  it("reverts every build when asked to (the self-test of the driver), without a violation", () => {
    const { mock, invoke, build } = setup({ revertBuilds: true });
    const { receipt } = invoke([build()]);
    expect(receipt.execution_status).toBe("REVERTED");
    expect(mock.placed).toBe(0);
    expect(mock.violations).toEqual([]);
  });
});
