// Transcribes CORE's golden games (`contracts/src/tests/golden/{daily,forest,full_deck}.cairo`)
// and the differential boards (`contracts/src/tests/differential.cairo`), with the frozen Tutorial golden
// (`tutorial-golden.frozen.ts`: its Cairo sources left the contracts with D-21), into
// `__tests__/fixtures/parity.json`, which `__tests__/engine-parity.test.ts` replays on the engine.
// Run `bun run generate:parity` in `packages/game-core`; `engine-parity.test.ts` fails while the
// fixture is out of date. The file has the format of CORE's parity fixture
// (`docs/architecture/parity-fixture.md`); where a value is not literal in the Cairo source, this
// hand transcription leaves it out (see `src/engine/README.md`). The Cairo test function (and file)
// of each game and the source of each added value go to `__tests__/fixtures/parity-sources.json`, by name and
// never by line number: a `scarb fmt` or an edit above a golden moves no source. A changed golden is caught by
// `parity.json` itself, which holds every move and expected value the script reads.
//
// What the script reads from the Cairo source, and nothing else: the moves, the forced plans, the
// day, the tile limit, the score after each move and the final counters (`GoldenOutcome`). The few
// values it adds are listed in `EXTRAS` and `DIFFERENTIAL`, each with the source it comes from.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FROZEN_TUTORIAL_GAME } from "./tutorial-golden.frozen";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
export const PARITY_TARGET = resolve(HERE, "../__tests__/fixtures/parity.json");
export const SOURCES_TARGET = resolve(HERE, "../__tests__/fixtures/parity-sources.json");
/** The contracts' `CENTER`: the fixture's coordinates are the contract's. */
const CENTER = 0x7fffffff;
const PLAN_CODES = [
  "None", "CCCCCCCCC", "CCCCCFFFC", "CCCCCFRFC", "CFFFCFFFC", "FFCFFFCFF", "FFCFFFFFC", "FFFFCCCFF",
  "FFFFFFCFF", "RFFFRFCFR", "RFFFRFFFR", "RFRFCCCFR", "RFRFFFCFR", "RFRFFFFFR", "RFRFRFCFF",
  "SFRFRFCFR", "SFRFRFFFR", "SFRFRFRFR", "WFFFFFFFF", "WFFFFFFFR",
];
const ORIENTATION_CODES = ["None", "North", "East", "South", "West"];
const CATEGORY_CODES = ["None", "Forest", "Road", "City", "Stop", "Wonder"];
const DECK_COUNTS = { simple: 38, tutorial: 10 };
const GOLDEN_FILES = ["daily", "forest", "full_deck"].map(
  (name) => `contracts/src/tests/golden/${name}.cairo`,
);
const DIFFERENTIAL_FILE = "contracts/src/tests/differential.cairo";

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
  /**
   * The draws come from the VRF (#645, D-30, docs/architecture/challenge-vrf.md): the golden games spawn on the devnet
   * mock, so their drawn plans are not computable from a seed. The fixture keeps the plans played and writes no `drawn`.
   */
  vrf?: boolean;
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

export interface Transcription {
  games: ParityGame[];
  notCovered: { test: string; source: string; reason: string }[];
}

/** `Scored` lists stated by the doc comments of the goldens (hand figures), by game and move. */
const EXTRAS: Record<string, { move: number; scored: ParityScored[]; source: string }[]> = {
  forest_ring: [
    {
      move: 3,
      source: "contracts/src/tests/golden/forest.cairo, doc comment of woodsman_ring_moves",
      scored: [
        { category: "Road", size: 4, points: 438 },
        { category: "Forest", size: 4, points: 329 },
      ],
    },
  ],
  forest_last: [
    {
      move: 3,
      source: "contracts/src/tests/golden/forest.cairo, doc comment of woodsman_ring_moves",
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
      source: "contracts/src/tests/golden/forest.cairo, doc comment of both_roles_moves",
      scored: [
        { category: "Road", size: 4, points: 438 },
        { category: "Forest", size: 4, points: 329 },
      ],
    },
  ],
  forest_open: [
    {
      move: 4,
      source: "contracts/src/tests/golden/forest.cairo, doc comment of herdsman_open_city_moves",
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
    source: "contracts/tests/gas.cairo (SCORE_E)",
  },
  test_differential_gas_scenario_f: {
    outcome: { score: 5618 },
    source: "contracts/tests/gas.cairo (SCORE_F)",
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
      source: `${file} (${name})`,
      deck: "simple",
      seed: "0x0",
      seedSource: `the VRF mock (#645): the player's spawn ${call[2]} on Challenge at its test address (golden/harness.cairo, spawn_golden); the draws are not asserted`,
      vrf: true,
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
        source: `${DIFFERENTIAL_FILE} (${name}); expectation: ${extra.source}`,
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

export function transcribe(read: (path: string) => string): Transcription {
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
  // The Tutorial golden, after the Cairo goldens as when it was read from `golden/tutorial.cairo` (frozen at 38f1c95, D-21)
  // Its frozen source names a line of a file that no longer exists: the sources file keeps the test name only
  const tutorial = structuredClone(FROZEN_TUTORIAL_GAME);
  tutorial.source = tutorial.source.replace(/(\.cairo):\d+/g, "$1");
  games.push(tutorial);
  for (const game of games) {
    for (const extra of EXTRAS[game.name] ?? []) {
      game.moves[extra.move] = { ...game.moves[extra.move], scored: extra.scored, scoredSource: extra.source };
    }
  }
  games.push(...parseDifferential(read(DIFFERENTIAL_FILE)));
  return { games, notCovered: NOT_COVERED };
}

// The format of CORE's parity fixture (`docs/architecture/parity-fixture.md`)

export interface FixtureScored {
  category: number;
  size: number;
  points: number;
}

export interface FixtureMove {
  /** The plan code drawn before the move; `null` where the Cairo source does not assert it. */
  drawn: number | null;
  plan: number;
  /** 0 for a discard (`x`, `y` 0). */
  orientation: number;
  x: number;
  y: number;
  /** Absent where the Cairo source does not state the move's `Scored` events. */
  scored?: FixtureScored[];
  /** Absent where the Cairo source does not assert the score after the move. */
  score?: number;
}

export interface FixtureGame {
  name: string;
  source: "golden" | "tutorial" | "differential";
  seed: string;
  tile_limit: number;
  forced: boolean;
  moves: FixtureMove[];
  final: {
    score?: number;
    /** Extension of the hand transcription: the source asserts only `score > score_above`. */
    score_above?: number;
    built?: number;
    discarded?: number;
    tile_count?: number;
    over?: boolean;
  };
}

export interface ParityFixture {
  version: 1;
  rules: string;
  games: FixtureGame[];
}

function code(codes: string[], name: string): number {
  const index = codes.indexOf(name);
  if (index < 0) throw new Error(`goldens: unknown code ${name}`);
  return index;
}

export function toFixture(transcription: Transcription): ParityFixture {
  return {
    version: 1,
    rules: "D-19",
    games: transcription.games.map((game) => {
      const kind = game.deck === "tutorial" ? "tutorial" : game.source.startsWith(DIFFERENTIAL_FILE) ? "differential" : "golden";
      const final: FixtureGame["final"] = {};
      if (game.outcome.score !== undefined) final.score = game.outcome.score;
      if (game.outcome.scoreAbove !== undefined) final.score_above = game.outcome.scoreAbove;
      if (game.outcome.built !== undefined) final.built = game.outcome.built;
      if (game.outcome.discarded !== undefined) final.discarded = game.outcome.discarded;
      if (game.outcome.tileCount !== undefined) final.tile_count = game.outcome.tileCount;
      if (game.outcome.over !== undefined) final.over = game.outcome.over;
      return {
        name: game.name,
        source: kind,
        seed: game.seed,
        tile_limit: game.tileLimit ?? DECK_COUNTS[game.deck],
        forced: game.moves.some((move) => move.drawn !== move.plan),
        moves: game.moves.map((move) => {
          const discard = move.action === "discard";
          const entry: FixtureMove = {
            drawn: move.drawn === null || game.vrf ? null : code(PLAN_CODES, move.drawn),
            plan: code(PLAN_CODES, move.plan),
            orientation: discard ? 0 : code(ORIENTATION_CODES, move.orientation as string),
            x: discard ? 0 : CENTER + (move.x as number),
            y: discard ? 0 : CENTER + (move.y as number),
          };
          if (move.scored) {
            entry.scored = move.scored.map((scored) => ({ ...scored, category: code(CATEGORY_CODES, scored.category) }));
          }
          if (move.score !== null) entry.score = move.score;
          return entry;
        }),
        final,
      };
    }),
  };
}

/** Where each game and each added value comes from, and what is not covered. */
export function toSources(transcription: Transcription): unknown {
  return {
    games: Object.fromEntries(
      transcription.games.map((game) => [
        game.name,
        {
          source: game.source,
          seed: game.seedSource,
          scored: game.moves.flatMap((move, step) => (move.scoredSource ? [{ move: step, source: move.scoredSource }] : [])),
        },
      ]),
    ),
    notCovered: transcription.notCovered,
  };
}

export function render(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function readRepository(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const transcription = transcribe(readRepository);
  writeFileSync(PARITY_TARGET, render(toFixture(transcription)));
  writeFileSync(SOURCES_TARGET, render(toSources(transcription)));
  console.log(`Wrote ${PARITY_TARGET} and ${SOURCES_TARGET}`);
}
