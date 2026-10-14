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
  const view = (contract: "Challenge" | "Token", to: bigint, name: string, args: Array<string | number | bigint | boolean> = []) => {
    const out = rpc("starknet_call", {
      request: { contract_address: hex(to), entry_point_selector: selector(name), calldata: codecs[contract].encodeCall(name, args) },
      block_id: "latest",
    });
    if (out.error) throw new Error(out.error.data?.revert_error ?? out.error.message);
    return codecs[contract].decodeResult(name, out.result) as any;
  };
  const challenge = (name: string, args: Array<string | number | bigint | boolean> = []) => view("Challenge", BENCH.Challenge, name, args);
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
    return [BENCH.Challenge, "build", [over.game ?? gameId, over.orientation ?? next.orientation, over.x ?? next.x, over.y ?? next.y]] as [bigint, string, number[]];
  };
  const events = (receipt: any): DecodedEvent[] => receiptEvents(receipt, codecs, "Challenge", hex(BENCH.Challenge));
  return { mock, rpc, view, challenge, gameId, invoke, build, events };
}

describe("addresses", () => {
  it("are the ones of the page, one source", () => {
    // D-25 (E): no Account: the bench reads no player registration.
    expect(BENCH).not.toHaveProperty("Account");
    expect(BENCH.Challenge).toBe(BigInt(BENCH_ADDRESSES.VITE_CHALLENGE_ADDRESS));
    expect(BENCH.Token).toBe(BigInt(BENCH_ADDRESSES.VITE_TOKEN_ADDRESS));
    expect(BENCH.player).toBe(BigInt(BENCH_ADDRESSES.VITE_PLAYER_ADDRESS));
  });
});

describe("views, decoded with the real ABIs", () => {
  it("game", () => {
    const { challenge, gameId, mock } = setup();
    const g = challenge("game", [gameId]);
    expect(Number(g.id)).toBe(gameId);
    expect(BigInt(g.playerId)).toBe(BENCH.player);
    expect(Number(g.mode)).toBe(1);
    expect(g.over).toBe(false);
    expect(Number(g.placedCount)).toBe(72);
    expect(Number(g.tileId)).toBe(mock.next()!.id);
    expect(Number(g.deckSize)).toBeGreaterThan(Number(g.tileCount));
  });

  it("tiles: the placed tiles, then the tile in hand, in pages", () => {
    const { challenge, gameId, mock } = setup();
    const page = challenge("tiles", [gameId, 0, 64]);
    expect(page).toHaveLength(64);
    const rest = challenge("tiles", [gameId, 64, 64]);
    expect(rest).toHaveLength(73 - 64);
    expect(rest.at(-1)).toMatchObject({ status: 3, id: mock.next()!.id });
    expect(page.every((t: any) => t.status === 1)).toBe(true);
  });

  it("builder, current_day, entry_price, player and balance_of", () => {
    const { challenge, view, gameId, mock } = setup();
    const b = challenge("builder", [gameId, BENCH.player]);
    expect(Number(b.gameId)).toBe(gameId);
    expect(Number(b.tileId)).toBe(mock.next()!.id);
    expect(Number(b.plan)).toBe(mock.next()!.plan);
    expect(Object.keys(b)).toEqual(["gameId", "playerId", "tileId", "plan"]);
    expect(Number(challenge("current_day"))).toBe(Math.floor(Date.parse("2026-10-06T08:00:00Z") / 1000 / 86400));
    const price = challenge("entry_price");
    expect(BigInt(price.token)).toBe(BENCH.Token);
    expect(BigInt(price.amount)).toBeGreaterThan(0n);
    expect(BigInt(view("Token", BENCH.Token, "balance_of", [BENCH.player]))).toBeGreaterThan(0n);
  });

  it("no view leaves felts over or short: each decodes whole", () => {
    // decodeResult refuses leftover felts and short reads (AbiMismatchError): the calls above passed it.
    const { challenge, gameId } = setup();
    expect(() => challenge("game", [gameId])).not.toThrow();
    expect(() => challenge("tiles", [gameId, 0, 1])).not.toThrow();
  });
});

describe("a build of the next placement", () => {
  it("succeeds, and its receipt holds Built and Scored, read back with the ABI", () => {
    const { mock, invoke, build, events, gameId, challenge } = setup();
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
    expect(Number(challenge("game", [gameId]).placedCount)).toBe(73);
  });

  it("ends the game with the last placement: GameOver in the receipt, over in the view", () => {
    const { mock, invoke, build, events, gameId, challenge } = setup();
    let last: any;
    while (mock.next()) last = invoke([build()]).receipt;
    expect(mock.violations).toEqual([]);
    const out = placementOutcome(events(last), gameId);
    expect(out.over).toMatchObject({ dayId: 0 });
    expect(out.over!.score).toBeGreaterThan(0);
    const names = events(last).map((e) => e.name);
    expect(names).toEqual(["Built", "Scored", "GameOver"]);
    expect(challenge("game", [gameId]).over).toBe(true);
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
    const { receipt } = invoke([build(), [BENCH.Token, "approve", [BENCH.Challenge, 1, 0]]]);
    expect(receipt.execution_status).toBe("REVERTED");
    expect(mock.placed).toBe(0);
    expect(mock.violations.map((v) => v.kind)).toEqual(["non-build-call"]);
  });

  it("records a view of another game or another player", () => {
    const { mock, view, gameId } = setup();
    view("Challenge", BENCH.Challenge, "game", [gameId + 1]); // answered, but recorded
    view("Challenge", BENCH.Challenge, "builder", [gameId, 0x7777]);
    view("Token", BENCH.Token, "balance_of", [0x7777]);
    expect(mock.violations.map((v) => v.kind)).toEqual(["other-game", "other-player", "other-player"]);
  });

  it("records a view it does not serve (the `tournament` view D-20 removed), and fails it", () => {
    const { mock, rpc } = setup();
    const out = rpc("starknet_call", { request: { contract_address: hex(BENCH.Challenge), entry_point_selector: selector("tournament"), calldata: [] } });
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
