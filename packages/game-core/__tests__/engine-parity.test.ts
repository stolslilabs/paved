// Parity of the off-chain engine with CORE's golden and differential games: each game of the
// parity fixture (`fixtures/parity.json`, transcribed from the Cairo tests by
// `scripts/transcribe-goldens.ts`) replays on the engine with exactly the plans drawn, the scores,
// the `Scored` events and the final counters it gives.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PARITY_TARGET,
  SOURCES_TARGET,
  readRepository,
  render,
  toFixture,
  toSources,
  transcribe,
} from "../scripts/transcribe-goldens";
import { FROZEN_TUTORIAL_GAME } from "../scripts/tutorial-golden.frozen";
import { PARITY_FIXTURE, loadParityFixture, replayParityGame } from "./parity-fixture";

const fixture = loadParityFixture(PARITY_FIXTURE);

describe("engine parity fixture", () => {
  it("is the transcription of the Cairo tests on this commit", () => {
    const transcription = transcribe(readRepository);
    // Run `bun run generate:parity` in packages/game-core when this fails
    expect(readFileSync(PARITY_TARGET, "utf8")).toBe(render(toFixture(transcription)));
    expect(readFileSync(SOURCES_TARGET, "utf8")).toBe(render(toSources(transcription)));
  });

  it("holds no line number in its sources", () => {
    expect(readFileSync(SOURCES_TARGET, "utf8")).not.toMatch(/\.(cairo|md)[:#]\d|:\d+(-\d+)? \(/);
  });

  it("covers the 11 golden games and the differential boards", () => {
    const names = fixture.games.map((game) => game.name);
    for (const name of [
      "daily_city5", "daily_road6", "daily_mixed", "daily_deck", "forest_ring", "forest_caps",
      "forest_both", "forest_open", "forest_last", "daily_full_deck", "tutorial_full",
    ]) {
      expect(names).toContain(name);
    }
    expect(fixture.games.filter((game) => game.source === "differential").length).toBeGreaterThan(0);
  });
});

// The sources are anchored by test name, so only the moves and expected values the script reads can change
// the fixture. Shown on the real Cairo text with a reformat and with a changed golden.
describe("the fixture's anchoring", () => {
  const rendered = (read: (path: string) => string) => {
    const transcription = transcribe(read);
    return [render(toFixture(transcription)), render(toSources(transcription))];
  };
  const expected = rendered(readRepository);

  it("ignores a reformat and a move within the file", () => {
    const reformatted = rendered((path) => {
      const text = readRepository(path);
      // A comment block and blank lines above every function, and a deeper indent: every line number moves
      return `// scarb fmt moved this\n\n\n${text.replace(/^(#\[test\])/gm, "\n// a new comment\n$1").replace(/^ {4}/gm, "      ")}`;
    });
    expect(reformatted).toEqual(expected);
  });

  it("fails when a golden's expected value changes", () => {
    const changed = rendered((path) =>
      path.endsWith("golden/daily.cairo") ? readRepository(path).replace(/\bscore: (\d+)/, (_, n) => `score: ${Number(n) + 1}`) : readRepository(path),
    );
    expect(changed[0]).not.toEqual(expected[0]);
  });

  it("fails when a golden's move changes", () => {
    const changed = rendered((path) =>
      path.endsWith("golden/forest.cairo") ? readRepository(path).replace("Orientation::South", "Orientation::North") : readRepository(path),
    );
    expect(changed[0]).not.toEqual(expected[0]);
  });
});

describe("the frozen Tutorial golden (D-21: its Cairo sources left at 38f1c95)", () => {
  const score = FROZEN_TUTORIAL_GAME.outcome.score;

  it("is the fixture's tutorial_full and replays on the engine to its exact score", () => {
    expect(score).toBe(2794);
    const game = fixture.games.find((entry) => entry.name === "tutorial_full");
    expect(game?.source).toBe("tutorial");
    expect(game?.final).toEqual({ score, built: 8, discarded: 1, tile_count: 10, over: true });
    const { engine } = replayParityGame(game!);
    expect(engine.score).toBe(score);
    expect(engine.over).toBe(true);
  });
});

describe.each(fixture.games.map((game) => [game.name, game] as const))("parity: %s", (_, game) => {
  it("replays exactly", () => {
    const { engine, moves } = replayParityGame(game);
    game.moves.forEach((move, step) => {
      const { drawn, result, scored } = moves[step];
      const at = `move ${step}`;
      if (move.drawn !== null) expect(drawn, `${at}: drawn`).toBe(move.drawn);
      if (move.scored !== undefined) expect(scored, `${at}: scored`).toEqual(move.scored);
      if (move.score !== undefined) expect(result.score, `${at}: score`).toBe(move.score);
      // One player: every `Scored` goes to the game's player (D-19, ruling 4)
      for (const event of result.scored) expect(event.player).toBe(engine.player);
    });
    const { final } = game;
    if (final.score !== undefined) expect(engine.score, "final score").toBe(final.score);
    if (final.score_above !== undefined) expect(engine.score).toBeGreaterThan(final.score_above);
    if (final.built !== undefined) expect(engine.built, "built").toBe(final.built);
    if (final.discarded !== undefined) expect(engine.discarded, "discarded").toBe(final.discarded);
    if (final.tile_count !== undefined) expect(engine.tileCount, "tile count").toBe(final.tile_count);
    if (final.over !== undefined) expect(engine.over, "over").toBe(final.over);
  });

  it("adds up: each build's Scored points are its score gain, a discard takes its penalty", () => {
    const { moves } = replayParityGame(game);
    let score = 0;
    for (const { result } of moves) {
      const gained = result.scored.reduce((sum, event) => sum + event.points, 0);
      expect(result.score).toBe(result.action === "discard" ? score - result.points : score + gained);
      score = result.score;
    }
  });
});
