import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CENTER, OrientationType, PUZZLE_PRIZE_COBBLES, PlanType, puzzleDayEnd, puzzleDeck, type SeededMove } from "@paved/game-core";
import { PlayModes } from "../src/components/containers/play-modes";
import { PuzzleEnd } from "../src/components/containers/puzzle-end";
import { MailSection, PrizeMail } from "../src/components/containers/inbox-mail";
import { PuzzleScene } from "../src/components/scenes/puzzle-scene";
import { MOCK_KEY, MockLedger } from "../src/data/mock/ledger";
import { mockPuzzle } from "../src/data/mock/overlay";
import { mockDaySeed, seededResults } from "../src/data/mock/puzzle";
import { PuzzleGame, replayPuzzle, usePuzzleSession } from "../src/data/puzzle-game";
import { puzzleMailDay, puzzleMailId } from "../src/data/puzzle";
import type { PuzzleGameRecord, PuzzleSource, PuzzleStanding } from "../src/data/puzzle-source";
import { puzzleMeter } from "../src/lib/score-meter";
import { fakeSources, memoryStore, renderData } from "./data-fakes";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

const DAY = 20_400;
const PLAYER = "0xabc123";
/** Another account of the device. */
const OTHER = "0xabc456";
const ORIENTATIONS = Object.values(OrientationType);

/** A ledger on a memory store, its clock `clock.t` (seconds). */
function ledgerAt(clock: { t: number }) {
  const store = memoryStore();
  const ledger = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.t });
  return { ledger, source: mockPuzzle(ledger) };
}

/** The first legal build of the tile in hand, else a discard: a plain player's move. */
function plainMove(record: PuzzleGameRecord): SeededMove {
  const { engine } = replayPuzzle(record);
  const p = engine.rules.legalPlacements()[0];
  return p ? { kind: "build", orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } : { kind: "discard" };
}

/** Plays a game to its end with `move` (the plain player's by default). */
async function playOut(source: PuzzleSource, gameId: number, move: (r: PuzzleGameRecord) => SeededMove = plainMove): Promise<PuzzleGameRecord> {
  for (let record = await source.game(gameId); ; record = await source.game(gameId)) {
    if (record.over) return record;
    await source.play(PLAYER, gameId, move(record));
  }
}

describe("the mock's Puzzle", () => {
  it("deals the day's deck in each game's own order", async () => {
    const clock = { t: DAY * 86_400 + 3_600 };
    const { source } = ledgerAt(clock);
    const game = await source.start(PLAYER);
    expect(game).toMatchObject({ day: DAY, moves: [], over: false, deckSeed: `0x${mockDaySeed(DAY).toString(16)}` });
    expect(replayPuzzle(game).engine.rules.hand).not.toBeNull();
    expect(puzzleDeck(BigInt(game.deckSeed))).toHaveLength(38);
  });

  it("ranks a finished game, and says what it did to the player's day", async () => {
    const clock = { t: DAY * 86_400 + 80_000 };
    const { source } = ledgerAt(clock);
    const first = await playOut(source, (await source.start(PLAYER)).id);
    expect(first.score).toBeGreaterThan(0);
    const others = seededResults(DAY, clock.t);
    const result = await source.result(first.id);
    expect(result).toMatchObject({ bestBefore: null, bestAfter: first.score, placeBefore: null, players: others.length + 1, late: false });
    expect(result.placeAfter).toBe(1 + others.filter((o) => o.score > first.score).length);
    const standing = await source.standing(DAY, PLAYER);
    expect(standing.me).toEqual({ place: result.placeAfter, score: first.score });
    expect(standing.entries.map((e) => e.score)).toEqual([...standing.entries.map((e) => e.score)].sort((a, b) => b - a));

    // A lower game keeps the best and the place.
    const second = await playOut(source, (await source.start(PLAYER)).id, () => ({ kind: "discard" }));
    expect(second.score).toBe(0);
    expect(await source.result(second.id)).toMatchObject({ bestBefore: first.score, bestAfter: first.score, placeBefore: result.placeAfter, placeAfter: result.placeAfter });
  });

  it("ranks equal scores of the same second by completion order: the standings, each game's place and the prize agree", async () => {
    const clock = { t: DAY * 86_400 };
    const { source } = ledgerAt(clock);
    expect(seededResults(DAY, clock.t)).toEqual([]);
    // PLAYER starts first, OTHER finishes first: both at 0 points, in the day's first second.
    const mine = await source.start(PLAYER);
    const theirs = await source.start(OTHER);
    await source.play(OTHER, theirs.id, { kind: "surrender" });
    await source.play(PLAYER, mine.id, { kind: "surrender" });
    const standing = await source.standing(DAY, PLAYER);
    expect(standing.entries.map((e) => [e.profile.address, e.place])).toEqual([
      [OTHER, 1],
      [PLAYER, 2],
    ]);
    expect(standing.me).toEqual({ place: 2, score: 0 });
    expect(await source.result(theirs.id)).toMatchObject({ placeAfter: 1, bestAfter: 0 });
    expect(await source.result(mine.id)).toMatchObject({ placeAfter: 2, bestAfter: 0 });
  });

  it("reads a save from before the completion order: two games of the same second still follow each other by id", async () => {
    const clock = { t: DAY * 86_400 + 600 };
    const store = memoryStore();
    const source = mockPuzzle(new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.t }));
    for (let i = 0; i < 2; i++) await source.play(PLAYER, (await source.start(PLAYER)).id, { kind: "surrender" });
    expect(await source.result(2)).toMatchObject({ bestBefore: 0, placeBefore: 1 });
    // The save as the client before the order wrote it: no `order` on any game.
    const saved = JSON.parse(store.getItem(MOCK_KEY)!) as { puzzle: { games: Record<string, { order?: number }> } };
    for (const g of Object.values(saved.puzzle.games)) delete g.order;
    store.setItem(MOCK_KEY, JSON.stringify(saved));
    const legacy = mockPuzzle(new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.t }));
    expect(await legacy.result(2)).toMatchObject({ bestBefore: 0, placeBefore: 1 });
    expect(await legacy.result(1)).toMatchObject({ bestBefore: null, placeBefore: null });
  });

  it("gives an equal first place to the result completed first: two accounts' welcome prizes of the same day", async () => {
    const clock = { t: DAY * 86_400 + 600 };
    const { source } = ledgerAt(clock);
    await source.visit(PLAYER);
    await source.visit(OTHER);
    const standing = await source.standing(DAY - 1, OTHER);
    expect(standing.entries.slice(0, 2).map((e) => [e.profile.address, e.place])).toEqual([
      [PLAYER, 1],
      [OTHER, 2],
    ]);
    expect(standing.entries[0]!.score).toBe(standing.entries[1]!.score);
    expect((await source.prizes(PLAYER)).map((p) => p.day)).toEqual([DAY - 1]);
    expect(await source.prizes(OTHER)).toEqual([]);
    await expect(source.claim(OTHER, [DAY - 1])).rejects.toThrow("Puzzle: not the day's winner");
    expect(await source.claim(PLAYER, [DAY - 1])).toEqual({ cobbles: PUZZLE_PRIZE_COBBLES });
  });

  it("refuses a second game while one is open, and a move past the game's day but a surrender", async () => {
    const clock = { t: DAY * 86_400 + 86_000 };
    const { source } = ledgerAt(clock);
    const game = await source.start(PLAYER);
    await expect(source.start(PLAYER)).rejects.toThrow("Puzzle: a game is open");
    expect(await source.activeGame(PLAYER)).toMatchObject({ id: game.id });
    clock.t = puzzleDayEnd(DAY) + 5;
    await expect(source.play(PLAYER, game.id, { kind: "discard" })).rejects.toThrow("Puzzle: the day is over");
    await source.play(PLAYER, game.id, { kind: "surrender" });
    const over = await source.game(game.id);
    expect(over.over).toBe(true);
    expect((await source.result(game.id)).late).toBe(true);
    // A new day: no open game of today.
    expect(await source.activeGame(PLAYER)).toBeNull();
  });

  it("leaves the day before a first visit won, its 250 Cobbles claimed once", async () => {
    const clock = { t: DAY * 86_400 + 600 };
    const { ledger, source } = ledgerAt(clock);
    expect(await source.prizes(PLAYER)).toEqual([]);
    await source.visit(PLAYER);
    const [prize] = await source.prizes(PLAYER);
    expect(prize).toMatchObject({ day: DAY - 1, claimed: false });
    expect(prize!.top[0]!.profile.address).toBe(PLAYER);
    expect(prize!.top.length).toBeLessThanOrEqual(10);
    expect(await source.claim(PLAYER, [DAY - 1])).toEqual({ cobbles: PUZZLE_PRIZE_COBBLES });
    expect((await ledger.account(PLAYER)).cobbles).toBe(PUZZLE_PRIZE_COBBLES);
    expect((await source.prizes(PLAYER))[0]).toMatchObject({ day: DAY - 1, claimed: true });
    await expect(source.claim(PLAYER, [DAY - 1])).rejects.toThrow("Puzzle: already claimed");
    await expect(source.claim(PLAYER, [DAY])).rejects.toThrow("Puzzle: the day is not over");
    await expect(source.claim(PLAYER, [DAY - 2])).rejects.toThrow("Puzzle: not the day's winner");
    // A visit again changes nothing.
    await source.visit(PLAYER);
    expect(await source.prizes(PLAYER)).toHaveLength(1);
  });
});

describe("a Puzzle game on the board", () => {
  it("applies a move at once and sends the moves in order", async () => {
    const clock = { t: DAY * 86_400 + 600 };
    const { source } = ledgerAt(clock);
    const record = await source.start(PLAYER);
    const sent: SeededMove[] = [];
    const game = PuzzleGame.open(record, async (move) => {
      sent.push(move);
      await source.play(PLAYER, record.id, move);
    });
    const slot = game.slots(1)[0] ?? game.slots(2)[0] ?? game.slots(3)[0] ?? game.slots(4)[0];
    expect(slot).toBeDefined();
    const orientation = [1, 2, 3, 4].find((o) => game.orientationsAt(slot!).includes(o))!;
    expect(game.place({ orientation, ...slot! })).toBe(true);
    expect(game.snapshot.state.tiles).toHaveLength(2);
    expect(game.discard()).toBe(true);
    expect(game.snapshot.sending).toBeGreaterThan(0);
    await vi.waitFor(() => expect(game.snapshot.sending).toBe(0));
    expect(sent.map((m) => m.kind)).toEqual(["build", "discard"]);
    expect((await source.game(record.id)).moves).toHaveLength(2);
  });

  it("stops at a refused move until it is read again", async () => {
    const record: PuzzleGameRecord = { id: 1, day: DAY, player: PLAYER, seed: "0x11", deckSeed: "0x22", moves: [], score: 0, over: false, start: 0, end: 0 };
    const game = PuzzleGame.open(record, () => Promise.reject(new Error("Puzzle: the day is over")));
    expect(game.discard()).toBe(true);
    await vi.waitFor(() => expect(game.snapshot.refused).toBe("Puzzle: the day is over"));
    expect(game.discard()).toBe(false);
    expect(game.slots(1)).toEqual([]);
  });
});

describe("a Puzzle game as the current account sees it (`usePuzzleSession`)", () => {
  it("shows another account's game read-only: no slot, no move taken, nothing sent as its player", async () => {
    const { source } = ledgerAt({ t: DAY * 86_400 + 600 });
    const record = await source.start(PLAYER);
    const { result } = renderData(() => usePuzzleSession(record.id, OTHER), fakeSources({ puzzle: source }).sources);
    await waitFor(() => expect(result.current.game).not.toBeNull());
    const game = result.current.game!;
    expect(game.writable).toBe(false);
    expect([1, 2, 3, 4].flatMap((o) => game.slots(o))).toEqual([]);
    expect(game.discard()).toBe(false);
    expect(game.surrender()).toBe(false);
    expect(await source.game(record.id)).toMatchObject({ moves: [], over: false });
  });

  it("opens the game again on a switch of account, its moves sent as the current account only", async () => {
    const { source } = ledgerAt({ t: DAY * 86_400 + 600 });
    const record = await source.start(PLAYER);
    let viewer: string | null = PLAYER;
    const { result, rerender } = renderData(() => usePuzzleSession(record.id, viewer), fakeSources({ puzzle: source }).sources);
    await waitFor(() => expect(result.current.game?.writable).toBe(true));
    viewer = OTHER;
    rerender();
    await waitFor(() => expect(result.current.game?.writable).toBe(false));
    expect(result.current.game!.discard()).toBe(false);
    viewer = null;
    rerender();
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.game!.writable).toBe(false);
    viewer = PLAYER;
    rerender();
    await waitFor(() => expect(result.current.game?.writable).toBe(true));
    expect(result.current.game!.discard()).toBe(true);
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect((await source.game(record.id)).moves).toEqual([{ kind: "discard" }]);
  });
});

describe("a Puzzle game across a switch of account (#1137 review)", () => {
  it("reads the game again after a switch away and back: the board never rolls back, the next moves match storage", async () => {
    const { source } = ledgerAt({ t: DAY * 86_400 + 600 });
    const record = await source.start(PLAYER);
    let viewer: string | null = PLAYER;
    const { result, rerender } = renderData(() => usePuzzleSession(record.id, viewer), fakeSources({ puzzle: source }).sources);
    const discarded = () => result.current.snapshot?.state.game?.discardedCount;
    await waitFor(() => expect(result.current.game?.writable).toBe(true));
    expect(result.current.game!.discard()).toBe(true);
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(discarded()).toBe(1);
    viewer = OTHER;
    rerender();
    await waitFor(() => expect(result.current.game?.writable).toBe(false));
    expect(discarded()).toBe(1);
    viewer = PLAYER;
    rerender();
    await waitFor(() => expect(result.current.game?.writable).toBe(true));
    expect(discarded()).toBe(1);
    expect(result.current.game!.discard()).toBe(true);
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(discarded()).toBe(2);
    expect((await source.game(record.id)).moves).toEqual([{ kind: "discard" }, { kind: "discard" }]);
  });

  it("sends a move still on its way before the switch reads the game again", async () => {
    const { source } = ledgerAt({ t: DAY * 86_400 + 600 });
    const record = await source.start(PLAYER);
    let viewer: string | null = PLAYER;
    const { result, rerender } = renderData(() => usePuzzleSession(record.id, viewer), fakeSources({ puzzle: source }).sources);
    await waitFor(() => expect(result.current.game?.writable).toBe(true));
    expect(result.current.game!.discard()).toBe(true);
    // Switched at once, the discard not taken yet: no game shown until it is, then the game as stored.
    viewer = OTHER;
    rerender();
    expect(result.current.game).toBeNull();
    await waitFor(() => expect(result.current.game?.writable).toBe(false));
    expect(result.current.snapshot?.state.game?.discardedCount).toBe(1);
    expect((await source.game(record.id)).moves).toHaveLength(1);
  });
});

describe("the Puzzle's meter and mails", () => {
  it("runs to the day's first place, lit once passed", () => {
    expect(puzzleMeter(null, 500)).toBeNull();
    const meter = puzzleMeter(1_000, 500)!;
    expect(meter.marks).toEqual([expect.objectContaining({ art: "trophy", reached: false, name: "First place: 1,000" })]);
    expect(puzzleMeter(1_000, 1_200)!.marks[0]!.reached).toBe(true);
    expect(puzzleMeter(1_000, 500, true)!.marks[0]!.name).toBe("Your best: 1,000");
  });

  it("names a prize's mail by its day", () => {
    expect(puzzleMailId(20_400)).toBe("puzzle-20400");
    expect(puzzleMailDay("puzzle-20400")).toBe(20_400);
    expect(puzzleMailDay("puzzle-x")).toBeNull();
    expect(puzzleMailDay(undefined)).toBeNull();
  });
});

const PROFILE = (address: string, name: string) => ({ address, name, look: null, level: 7, crowns: 120, league: 1, score: 0, lastSeen: 0 });
const STANDING: PuzzleStanding = {
  day: DAY,
  endsAt: puzzleDayEnd(DAY),
  seed: "0x22",
  players: 3,
  entries: [
    { profile: PROFILE("0x1", "Elder Ashgrove"), score: 1_640, place: 1 },
    { profile: PROFILE(PLAYER, "Hob Underhill"), score: 1_270, place: 2 },
    { profile: PROFILE("0x3", "Isolde"), score: 900, place: 3 },
  ],
  me: { place: 2, score: 1_270 },
};

describe("the Puzzle's scenes", () => {
  it("shows the card in Limited: its line until played, then the best and the place; the time left in its corner", async () => {
    const onPuzzle = vi.fn();
    const now = puzzleDayEnd(DAY) - 5 * 3_600;
    const { rerender } = render(wrap(<PlayModes spawnPaused={false} now={now} puzzleCard={{ endsAt: puzzleDayEnd(DAY), best: null, playing: null }} onPuzzle={onPuzzle} />));
    expect(screen.queryByRole("button", { name: "Coming soon" })).toBeNull();
    const card = screen.getByRole("button", { name: "Puzzle" });
    expect(card).toHaveTextContent("PuzzleOne deck for all");
    expect(screen.getByRole("timer")).toHaveTextContent("5h 0m");
    await userEvent.click(card);
    expect(onPuzzle).toHaveBeenCalledOnce();
    rerender(wrap(<PlayModes spawnPaused={false} now={now} puzzleCard={{ endsAt: puzzleDayEnd(DAY), best: { score: 1_270, place: 28 }, playing: null }} />));
    expect(screen.getByRole("button", { name: "Puzzle" })).toHaveTextContent(/^Puzzle#281,270$/);
    rerender(wrap(<PlayModes spawnPaused={false} now={now} puzzleCard={{ endsAt: puzzleDayEnd(DAY), best: { score: 1_270, place: 28 }, playing: { score: 860 } }} />));
    expect(screen.getByRole("button", { name: /^Puzzle: resume your game/ })).toHaveTextContent("860in play");
  });

  it("lists the day's leaderboard, the viewer's row in gold, and plays", async () => {
    const onPlay = vi.fn();
    render(wrap(<PuzzleScene standing={STANDING} now={STANDING.endsAt - 600} me={PLAYER} onPlay={onPlay} />));
    const rows = within(screen.getByRole("list", { name: "Today's leaderboard" })).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["1. Elder Ashgrove, 1,640 points", "2. Hob Underhill (you), 1,270 points", "3. Isolde, 900 points"]);
    expect(rows[1]).toHaveAttribute("data-own");
    expect(screen.getByRole("group", { name: "Today" })).toHaveTextContent("10m");
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("ends a game in VICTORY when its score takes first place, else GAME OVER", () => {
    const closings = [] as const;
    const { rerender } = render(wrap(<PuzzleEnd score={1_670} firstPlace={1_640} dayLabel="Sun, Nov 8" closings={closings} result={{ bestBefore: 1_270, bestAfter: 1_670, placeBefore: 4, placeAfter: 1, players: 128, late: false }} />));
    expect(screen.getByText("VICTORY")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent("1,6701,270 → 1,670");
    expect(screen.getByRole("region", { name: "Placement" })).toHaveTextContent("#1#4 → #1");
    rerender(wrap(<PuzzleEnd score={1_120} firstPlace={1_640} dayLabel="Sun, Nov 8" closings={closings} result={{ bestBefore: 1_270, bestAfter: 1_270, placeBefore: 28, placeAfter: 28, players: 128, late: false }} />));
    expect(screen.getByText("GAME OVER")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Score" })).toHaveTextContent("1,120Best 1,270");
    expect(screen.getByRole("region", { name: "Placement" })).toHaveTextContent("#28Unchanged");
  });

  it("lists a prize's mail with Claim all, and opens its gift on a tap", async () => {
    const onClaimAll = vi.fn();
    const onOpen = vi.fn();
    render(wrap(<MailSection mails={[{ id: "puzzle-20399", day: DAY - 1, at: puzzleDayEnd(DAY - 1), claimed: false }]} now={puzzleDayEnd(DAY - 1) + 60} onClaimAll={onClaimAll} onOpen={onOpen} />));
    await userEvent.click(screen.getByRole("button", { name: "Claim all" }));
    expect(onClaimAll).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: /you won, 250 Cobbles waiting$/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("opens a prize's mail: its gift claims it, its ranking lists the day's first ten", async () => {
    const onClaim = vi.fn();
    const onDelete = vi.fn();
    render(wrap(<PrizeMail day={DAY - 1} score={1_812} players={141} top={STANDING.entries} me={PLAYER} claimed={false} onClaim={onClaim} onDelete={onDelete} />));
    expect(screen.queryByRole("button", { name: /^Claim/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: `Open the gift: ${PUZZLE_PRIZE_COBBLES} Cobbles` }));
    expect(onClaim).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Delete this mail" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(within(screen.getByRole("region", { name: "Final ranking" })).getAllByRole("button")).toHaveLength(3);
  });
});

it("keeps the starter first in the day's deck", () => {
  expect(puzzleDeck(mockDaySeed(DAY))[0]).toBe(PlanType.RFFFRFCFR);
});
