/** The player's XP and level (#641, `docs/architecture/xp-level.md`): `Setup.player_level`, the curve, the fake. */
import { describe, expect, test } from "vitest";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { LEVEL_STEP, MAX_XP, PLAYER_LEVEL_FIELDS, levelFloor, levelOf, playerLevelOf } from "../src/level";
import { FAKE_ROUTER_FILE } from "../src/testing";
import { FakeGameViews, RpcGameViews, type CallProvider } from "../src/views";

const ADDR = { Challenge: "0x2", Setup: "0x3" };
const PLAYER = "0x5";
const base = resolveDeployment({ network: "devnet", file: FAKE_ROUTER_FILE, env: { rpcUrl: "http://x", addresses: ADDR } });

describe("the curve mirrors Setup's level_of and level_floor", () => {
  test("level L starts at 50 L (L - 1) XP", () => {
    expect(LEVEL_STEP).toBe(100);
    const table: [number, number][] = [[1, 0], [2, 100], [3, 300], [4, 600], [5, 1000], [10, 4500], [20, 19000], [30, 43500]];
    for (const [level, floor] of table) {
      expect(levelFloor(level)).toBe(floor);
      expect(levelOf(floor)).toBe(level);
    }
    expect(levelOf(99)).toBe(1);
    expect(levelOf(MAX_XP)).toBe(1638);
  });

  test("every level to the ceiling starts at its floor; one XP under it is the level before", () => {
    for (let level = 2; level <= 1638; level++) {
      expect(levelOf(levelFloor(level))).toBe(level);
      expect(levelOf(levelFloor(level) - 1)).toBe(level - 1);
    }
  });

  test("playerLevelOf gives the view's shape: the XP between its two floors", () => {
    expect(playerLevelOf(0)).toEqual({ xp: 0, level: 1, floor: 0, next: 100 });
    expect(playerLevelOf(125)).toEqual({ xp: 125, level: 2, floor: 100, next: 300 });
  });
});

describe("Setup.player_level", () => {
  test("PlayerLevel has the ABI's fields, in order; Setup has player_level and credit_xp", () => {
    const codecs = createCodecs();
    expect(codecs.Setup.structFields("paved::systems::setup::PlayerLevel")).toEqual(PLAYER_LEVEL_FIELDS);
    expect(codecs.Setup.hasFunction("player_level")).toBe(true);
    expect(codecs.Setup.hasFunction("credit_xp")).toBe(true);
  });

  test("the RPC view decodes the XP, the level and its floors", async () => {
    const calls: Array<{ entrypoint: string; calldata: string[] }> = [];
    const provider: CallProvider = { callContract: async (call) => (calls.push(call), ["0x7d", "0x2", "0x64", "0x12c"]) };
    const views = new RpcGameViews(provider, base, createCodecs());
    expect(await views.playerLevel(PLAYER)).toEqual({ xp: 125, level: 2, floor: 100, next: 300 });
    expect(calls).toEqual([expect.objectContaining({ contractAddress: ADDR.Setup, entrypoint: "player_level", calldata: ["0x5"] })]);
  });

  test("the fake answers from the Cobbles account's XP; a player with none is level 1", async () => {
    const views = new FakeGameViews();
    expect(await views.playerLevel(PLAYER)).toEqual({ xp: 0, level: 1, floor: 0, next: 100 });
    views.cobblePlayer(PLAYER).account.xp = 4500;
    expect(await views.playerLevel(PLAYER)).toEqual({ xp: 4500, level: 10, floor: 4500, next: 5500 });
    expect(views.calls).toContain("player_level 5");
    views.cobblesFail = new Error("node down");
    await expect(views.playerLevel(PLAYER)).rejects.toThrow("node down");
  });
});
