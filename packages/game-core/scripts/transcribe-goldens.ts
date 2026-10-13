// Transcribes CORE's golden games (`contracts/src/tests/golden/{daily,forest,full_deck,tutorial}.cairo`)
// and the differential boards (`contracts/src/tests/differential.cairo`) into
// `__tests__/fixtures/parity.json`, which `__tests__/engine-parity.test.ts` replays on the engine.
// Run `bun run generate:parity` in `packages/game-core`; `engine-parity.test.ts` fails while the
// fixture is out of date. The format is documented in `src/engine/README.md`.
//
// What the script reads from the Cairo source, and nothing else: the moves, the forced plans, the
// day, the tile limit, the score after each move and the final counters (`GoldenOutcome`). The few
// values it adds are listed in `EXTRAS` and `DIFFERENTIAL`, each with the source line it comes from.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { poseidonHashMany } from "@scure/starknet";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
export const PARITY_TARGET = resolve(HERE, "../__tests__/fixtures/parity.json");
const GOLDEN_FILES = ["daily", "forest", "full_deck", "tutorial"].map(
  (name) => `contracts/src/tests/golden/${name}.cairo`,
);
const DIFFERENTIAL_FILE = "contracts/src/tests/differential.cairo";
const DAY_SECONDS = 86400;

export interface ParityScored {
  category: string;
  size: number;
  points: number;
}

export interface ParityMove {
  /** The plan the deck must have drawn before the move; `null` when the source does not assert it. */
  drawn: string | null;
  /** The plan played: `drawn`, or the plan forced over it. */
  plan: string;
  action: "build" | "discard";
  /** Absent for a Tutorial build, whose placement is scripted. */
  orientation?: string;
  x?: number;
  y?: number;
  /** The score once the move is played; `null` when the source does not assert it. */
  score: number | null;
  /** The `Scored` events of the move, in order, when the source states them (see `EXTRAS`). */
  scored?: ParityScored[];
  scoredSource?: string;
}

export interface ParityGame {
  name: string;
  source: string;
  deck: "simple" | "tutorial";
  /** The initial seed, a hex felt. */
  seed: string;
  seedSource: string;
  /** The tile limit when the game cuts the deck, else `null` (the deck's count). */
  tileLimit: number | null;
  moves: ParityMove[];
  outcome: {
    score?: number;
    /** The final score must be above this (the source asserts only `score > 0`). */
    scoreAbove?: number;
    built?: number;
    discarded?: number;
    tileCount?: number;
    over?: boolean;
  };
}

export interface ParityFixture {
  version: 1;
  generatedBy: string;
  games: ParityGame[];
  notCovered: { test: string; source: string; reason: string }[];
}

/** `Scored` lists stated by the doc comments of the goldens (hand figures), by game and move. */
const EXTRAS: Record<string, { move: number; scored: ParityScored[]; source: string }[]> = {
  forest_ring: [
    {
      move: 3,
      source: "contracts/src/tests/golden/forest.cairo:28-31",
      scored: [
        { category: "Road", size: 4, points: 438 },
        { category: "Forest", size: 4, points: 329 },
      ],
    },
  ],
  forest_last: [
    {
      move: 3,
      source: "contracts/src/tests/golden/forest.cairo:28-31",
      scored: [
        { category: "Road", size: 4, points: 438 },
        { category: "Forest", size: 4, points: 329 },
      ],
    },
  ],
  forest_caps: [
    {
      move: 1,
      source: "docs/measures/golden-games.md, hand check of forest_caps, step 2",
      scored: [{ category: "City", size: 3, points: 643 }],
    },
    {
      move: 4,
      source: "docs/measures/golden-games.md, hand check of forest_caps, step 5",
      scored: [
        { category: "City", size: 3, points: 643 },
        { category: "Forest", size: 2, points: 628 },
      ],
    },
  ],
  forest_both: [
    {
      move: 8,
      source: "contracts/src/tests/golden/forest.cairo:53-57",
      scored: [
        { category: "Road", size: 4, points: 438 },
        { category: "Forest", size: 4, points: 329 },
      ],
    },
  ],
  forest_open: [
    {
      move: 4,
      source: "contracts/src/tests/golden/forest.cairo:84-86",
      scored: [{ category: "Forest", size: 2, points: 0 }],
    },
  ],
};

/** The literal expectations of the differential boards, which `differential.cairo` does not hold. */
const DIFFERENTIAL: Record<string, { outcome: ParityGame["outcome"]; source: string }> = {
  test_differential_gas_scenarios_a0_a_b: {
    outcome: {},
    source: "contracts/src/tests/differential.cairo (no score asserted: every move must be legal)",
  },
  test_differential_gas_scenario_c: {
    outcome: { scoreAbove: 0 },
    source: "contracts/src/tests/differential.cairo (assert game.score > 0)",
  },
  test_differential_gas_scenario_d: {
    outcome: { scoreAbove: 0 },
    source: "contracts/src/tests/differential.cairo (assert game.score > 0)",
  },
  test_differential_gas_scenario_e: {
    outcome: { score: 767 },
    source: "contracts/tests/gas.cairo:65 (SCORE_E)",
  },
  test_differential_gas_scenario_f: {
    outcome: { score: 5618 },
    source: "contracts/tests/gas.cairo:66 (SCORE_F)",
  },
  test_differential_two_areas_of_one_tile_join_one_structure: {
    outcome: {},
    source: "contracts/src/tests/differential.cairo (no score asserted: every move must be legal)",
  },
};

const NOT_COVERED = [
  {
    test: "test_differential_wonder_ring",
    source: `${DIFFERENTIAL_FILE}`,
    reason:
      "six of its tiles are written with Store::set_tile, without a build, and it asserts only that the score grows: replayed in __tests__/engine.test.ts with EngineGame.write instead",
  },
  {
    test: "test_differential_tutorial_full_sequence",
    source: `${DIFFERENTIAL_FILE}`,
    reason: "the same scripted run as test_golden_tutorial_full_sequence, which is covered",
  },
  {
    test: "GoldenOutcome.top1_score",
    source: "contracts/src/tests/golden/harness.cairo",
    reason: "the tournament's leaderboard is not part of the engine",
  },
];

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** `CENTER`, `CENTER + 2`, `CENTER - 1` relative to the starter. */
function coordinate(text: string): number {
  const match = text.trim().match(/^CENTER(?:\s*([+-])\s*(\d+))?$/);
  if (!match) throw new Error(`goldens: bad coordinate ${text}`);
  if (!match[1]) return 0;
  return (match[1] === "+" ? 1 : -1) * Number(match[2]);
}

function plan(text: string): string {
  const match = text.trim().match(/^Plan::([A-Z]+)$/);
  if (!match) throw new Error(`goldens: bad plan ${text}`);
  return match[1];
}

function orientation(text: string): string {
  const match = text.trim().match(/^Orientation::([A-Za-z]+)$/);
  if (!match) throw new Error(`goldens: bad orientation ${text}`);
  return match[1];
}

function args(text: string): string[] {
  return text.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

function parseMoves(body: string): ParityMove[] {
  const moves: ParityMove[] = [];
  for (const match of body.matchAll(/\b(forced|mv|discard|step)\(([^()]*)\)/g)) {
    const a = args(match[2]);
    if (match[1] === "forced") {
      moves.push({
        drawn: plan(a[0]),
        plan: plan(a[1]),
        action: "build",
        orientation: orientation(a[2]),
        x: coordinate(a[3]),
        y: coordinate(a[4]),
        score: Number(a[5]),
      });
    } else if (match[1] === "mv") {
      moves.push({
        drawn: plan(a[0]),
        plan: plan(a[0]),
        action: "build",
        orientation: orientation(a[1]),
        x: coordinate(a[2]),
        y: coordinate(a[3]),
        score: Number(a[4]),
      });
    } else if (match[1] === "discard") {
      moves.push({ drawn: plan(a[0]), plan: plan(a[0]), action: "discard", score: Number(a[1]) });
    } else {
      const discard = a[1] === "true";
      moves.push({
        drawn: plan(a[0]),
        plan: plan(a[0]),
        action: discard ? "discard" : "build",
        score: Number(a[2]),
      });
    }
  }
  return moves;
}

function parseOutcome(text: string): ParityGame["outcome"] {
  const value = (key: string): string => {
    const match = text.match(new RegExp(`\\b${key}:\\s*([a-z0-9_]+)`));
    if (!match) throw new Error(`goldens: outcome without ${key}`);
    return match[1];
  };
  return {
    score: Number(value("score")),
    built: Number(value("built")),
    discarded: Number(value("discarded")),
    tileCount: Number(value("tile_count")),
    over: value("over") === "true",
  };
}

/** The Daily seed of `spawn` at `day(index)`: Poseidon(salt 0, tournament id). */
function dailySeed(dayIndex: number): string {
  const time = DAY_SECONDS * (1000 + dayIndex) + 3600;
  const tournament = BigInt(Math.floor(time / DAY_SECONDS));
  return `0x${poseidonHashMany([0n, tournament]).toString(16)}`;
}

/** The golden games of one file. */
function parseGoldens(file: string, source: string): ParityGame[] {
  const helpers = new Map<string, ParityMove[]>();
  for (const match of source.matchAll(/fn (\w+)\(\) -> Array<GoldenMove> \{\s*array!\[([\s\S]*?)\]\s*\}/g)) {
    helpers.set(match[1], parseMoves(match[2]));
  }
  const games: ParityGame[] = [];
  const tests = /#\[test\][\s\S]*?fn (test_golden_\w+)\(\) \{([\s\S]*?)\n\}/g;
  for (const test of source.matchAll(tests)) {
    const name = test[1];
    const body = test[2];
    const line = lineOf(source, test.index ?? 0);
    const tutorial = body.match(/let steps = array!\[([\s\S]*?)\];\s*play_tutorial\(\s*'(\w+)'[\s\S]*?GoldenOutcome \{([\s\S]*?)\}/);
    if (tutorial) {
      games.push({
        name: tutorial[2],
        source: `${file}:${line} (${name})`,
        deck: "tutorial",
        seed: "0x0",
        seedSource: "contracts/src/types/mode.cairo, Mode::seed: 0 for the Tutorial",
        tileLimit: null,
        moves: parseMoves(tutorial[1]),
        outcome: parseOutcome(tutorial[3]),
      });
      continue;
    }
    const call = body.match(/play_daily(?:_checked(?:_lite)?)?\(\s*'(\w+)',\s*day\((\d+)\),\s*\w+\(\),\s*(true|false),\s*(\d+),\s*([\w.()]+)/);
    if (!call) throw new Error(`goldens: ${name} has no play_daily call`);
    let moves: ParityMove[];
    const inline = body.match(/let moves = array!\[([\s\S]*?)\];/);
    const helper = call[5].match(/^(\w+)\(\)/) ?? body.match(/let moves = (\w+)\(\);/);
    if (inline) {
      moves = parseMoves(inline[1]);
    } else if (helper && helpers.has(helper[1])) {
      moves = helpers.get(helper[1]) as ParityMove[];
    } else {
      throw new Error(`goldens: ${name} has no moves`);
    }
    const outcomeText = body.match(/GoldenOutcome \{([\s\S]*?)\}/)?.[1] ??
      source.match(/fn \w+_outcome\(\) -> GoldenOutcome \{\s*GoldenOutcome \{([\s\S]*?)\}/)?.[1];
    if (!outcomeText) throw new Error(`goldens: ${name} has no outcome`);
    const forced = call[3] === "true";
    games.push({
      name: call[1],
      source: `${file}:${line} (${name})`,
      deck: "simple",
      seed: dailySeed(Number(call[2])),
      seedSource: `Poseidon(0, ${1000 + Number(call[2])}): Mode::seed of day(${call[2]}) (golden/harness.cairo), salt 0 (hostable.cairo)`,
      tileLimit: Number(call[4]) === 0 ? null : Number(call[4]),
      moves: moves.map((move) => (forced ? move : { ...move, plan: move.drawn as string })),
      outcome: parseOutcome(outcomeText),
    });
  }
  return games;
}

/** The boards of `differential.cairo` built with `board.build` / `board.step` (forced plans). */
function parseDifferential(source: string): ParityGame[] {
  const games: ParityGame[] = [];
  const tests = /#\[test\][\s\S]*?fn (test_differential_\w+)\(\) \{([\s\S]*?)\n\}/g;
  for (const test of source.matchAll(tests)) {
    const name = test[1];
    const extra = DIFFERENTIAL[name];
    if (!extra) continue;
    const body = test[2];
    const plans = new Map<string, string>();
    for (const binding of body.matchAll(/let (\w+) = (Plan::[A-Z]+);/g)) plans.set(binding[1], plan(binding[2]));
    let boards: ParityMove[][] = [];
    for (const statement of body.matchAll(/(BoardTrait::new\(\))|board\.(?:build|step)\(([^()]*)\)/g)) {
      if (statement[1]) {
        boards.push([]);
        continue;
      }
      const a = args(statement[2]);
      boards[boards.length - 1].push({
        drawn: null,
        plan: plans.get(a[0]) ?? plan(a[0]),
        action: "build",
        orientation: orientation(a[1]),
        x: coordinate(a[2]),
        y: coordinate(a[3]),
        score: null,
      });
    }
    boards = boards.filter((board) => board.length > 0);
    boards.forEach((moves, index) => {
      const last = index === boards.length - 1;
      games.push({
        name: boards.length > 1 ? `${name}#${index + 1}` : name,
        source: `${DIFFERENTIAL_FILE}:${lineOf(source, test.index ?? 0)} (${name}); expectation: ${extra.source}`,
        deck: "simple",
        seed: "0x0",
        seedSource: "any: the plans are forced and no draw is asserted",
        tileLimit: null,
        moves,
        outcome: last ? extra.outcome : {},
      });
    });
  }
  return games;
}

export function transcribe(read: (path: string) => string): ParityFixture {
  const games: ParityGame[] = [];
  const seen = new Set<string>();
  for (const file of GOLDEN_FILES) {
    for (const game of parseGoldens(file, read(file))) {
      // The checked twins (`*_structures_agree`) replay the same data
      const key = JSON.stringify({ ...game, source: "" });
      if (seen.has(key)) continue;
      seen.add(key);
      games.push(game);
    }
  }
  for (const game of games) {
    for (const extra of EXTRAS[game.name] ?? []) {
      game.moves[extra.move] = { ...game.moves[extra.move], scored: extra.scored, scoredSource: extra.source };
    }
  }
  games.push(...parseDifferential(read(DIFFERENTIAL_FILE)));
  return {
    version: 1,
    generatedBy: "packages/game-core/scripts/transcribe-goldens.ts",
    games,
    notCovered: NOT_COVERED,
  };
}

export function renderFixture(fixture: ParityFixture): string {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

export function readRepository(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(PARITY_TARGET, renderFixture(transcribe(readRepository)));
  console.log(`Wrote ${PARITY_TARGET}`);
}
