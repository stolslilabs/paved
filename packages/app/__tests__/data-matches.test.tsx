import { describe, expect, it } from "vitest";
import { FIXTURE_ADA } from "@paved/chain/testing";
import { DEFAULT_AVATAR, decodeAvatar } from "@paved/renderer";
import { VillageDraft, attackDeckSize, attackStars, layoutScore, levelStatus } from "@paved/game-core";
import { attackV2Board } from "../src/data/free-attack";
import { matchBoardSide } from "../src/data/matches";
import type { MockLedger } from "../src/data/mock/ledger";
import { mockRivalV2 } from "../src/data/mock/v2";
import { generatedLook } from "../src/mocks/avatar";
import { mockImplementation } from "./mock-fakes";

// PvP v2's matches on the mock (#786): an attack keeps the attacked village's snapshot at its start, a rival answers at the
// player's next search with an attack on the player's village (its own snapshot), and the list holds both, newest first. A
// defender's later edit leaves every record as it was.

const PLAYER = FIXTURE_ADA;

/** One whole attack of the player's: drawn, started, every tile played where it first fits (else discarded). */
async function attackOnce(ledger: MockLedger) {
  await ledger.drawOpponentV2(PLAYER, "search");
  await ledger.startAttackV2(PLAYER);
  for (;;) {
    const { attack } = await ledger.attackV2(PLAYER);
    if (attack!.status !== "open") return attack!;
    const board = attackV2Board(attack!);
    const plan = attack!.view[0]!;
    const cell = board.slots(plan)[0];
    await ledger.playAttackV2(PLAYER, cell ? { discard: false, orientation: board.orientations(plan, cell)[0]!, cell } : { discard: true });
  }
}

describe("PvP v2's matches on the mock (#786)", () => {
  it("an attack keeps the attacked village's snapshot; a later change to that village leaves the record unchanged", async () => {
    const { ledger } = mockImplementation();
    await ledger.foundFreeVillage(PLAYER);
    const done = await attackOnce(ledger);
    const rival = mockRivalV2(done.defender)!;
    const [match] = await ledger.matchesV2(PLAYER);
    expect(match).toMatchObject({ id: `a${done.id}`, side: "attack", rival: { address: rival.address, name: rival.name, level: rival.level }, target: rival.score, score: done.score, stars: done.stars, crowns: done.gained - done.lost, xp: done.xp, chest: done.chest });
    expect(match!.village).toEqual(rival.tiles);
    // The rival saved no avatar: a face seeded by its address (#834), the same at every read, as a decimal look.
    expect(match!.rival.look).toBe(String(generatedLook(rival.address)));
    expect(decodeAvatar(BigInt(match!.rival.look!))).not.toEqual(DEFAULT_AVATAR);
    expect(match!.moves).toEqual(done.moves);
    expect(match!.stars).toBe(attackStars(match!.score, match!.target));

    // The defender edits the village (the rival's layout changes in place): the record keeps the layout the attack found.
    const before = rival.tiles.map((t) => ({ ...t }));
    const lifted = rival.tiles.pop()!;
    try {
      const [again] = await ledger.matchesV2(PLAYER);
      expect(again!.village).toEqual(before);
      expect(again!.village).not.toEqual(rival.tiles);
    } finally {
      rival.tiles.push(lifted);
    }
  });

  it("a rival answers at the next search, on the player's village as it was, and shields it; the player's later edit leaves the defence unchanged", async () => {
    const { ledger } = mockImplementation();
    await ledger.foundFreeVillage(PLAYER);
    // The first search has nothing to answer.
    await attackOnce(ledger);
    expect((await ledger.matchesV2(PLAYER)).map((m) => m.side)).toEqual(["attack"]);
    const crowns = (await ledger.pvpLeague(PLAYER)).crowns;
    const layout = (await ledger.freeVillage(PLAYER)).tiles;

    await ledger.drawOpponentV2(PLAYER, "search");
    const list = await ledger.matchesV2(PLAYER);
    expect(list.map((m) => m.id)).toEqual(["d1", "a1"]);
    const defence = list[0]!;
    const attacked = mockRivalV2((await ledger.attackV2Of(PLAYER, 1))!.defender)!;
    expect(defence).toMatchObject({ side: "defence", rival: { address: attacked.address, name: attacked.name }, target: layoutScore(layout), xp: 0, chest: null, surrendered: false });
    expect(defence.village).toEqual(layout);
    // The deck is drawn from the player's village as an attack's is (ceil(1.15 x S)), every tile played.
    expect(defence.moves).toHaveLength(attackDeckSize(levelStatus((await ledger.freeVillage(PLAYER)).xp).slots));
    expect(defence.stars).toBe(attackStars(defence.score, defence.target));
    // The crowns the stars took (or the cost the defence won) move the player's count.
    expect(Math.sign(defence.crowns)).toBe(defence.stars > 0 ? -1 : 1);
    expect((await ledger.pvpLeague(PLAYER)).crowns).toBe(crowns + defence.crowns);
    // The attacked village is shielded for 8 hours, as any is, until the player starts an attack.
    const shield = await ledger.pvpShield(PLAYER);
    expect(shield.up).toBe(true);
    expect(shield.until).toBe(defence.finishedAt + 8 * 3_600);

    // The player edits their village: the defence's snapshot stays as it was.
    const village = await ledger.freeVillage(PLAYER);
    const inventory = await ledger.inventory(PLAYER);
    const draft = new VillageDraft({ slots: village.slots, inventory }, village.tiles);
    const outer = draft.tiles.find((t) => draft.liftRefusal(t.x, t.y) === null)!;
    draft.lift(outer.x, outer.y);
    await ledger.saveLayout(PLAYER, draft.tiles);
    expect((await ledger.freeVillage(PLAYER)).tiles).toHaveLength(layout.length - 1);
    expect((await ledger.matchesV2(PLAYER))[0]!.village).toEqual(layout);

    // One answer per attack: the next search, with nothing new attacked, adds none.
    await ledger.drawOpponentV2(PLAYER, "next").catch(() => undefined);
    expect((await ledger.matchesV2(PLAYER)).filter((m) => m.side === "defence")).toHaveLength(1);

    // Starting an attack drops the shield.
    await ledger.startAttackV2(PLAYER);
    expect((await ledger.pvpShield(PLAYER)).up).toBe(false);
  });

  it("each view's void: the rival's village red, the player's own green; the player's build blue, a rival's red", () => {
    expect(matchBoardSide("attack", "village")).toBe("rival");
    expect(matchBoardSide("attack", "build")).toBe("attack");
    expect(matchBoardSide("defence", "village")).toBe("own");
    expect(matchBoardSide("defence", "build")).toBe("rival");
  });
});
