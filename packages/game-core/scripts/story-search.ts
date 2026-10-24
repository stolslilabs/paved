// Sets the Story targets (`src/story/plan.ts`): the exact optimum for an `exact` level (`engine/solver.ts`), the best
// known score for a `best-known` level: the designer's line (`engine/designer.ts`), then a portfolio of beam settings
// (`engine/beam.ts`), each seeded with the designer's line, tried in a fixed order until the time cap. A stored line is
// replayed first and kept unless something beats it, so a target only ever rises. Prints a Markdown table of the cost per
// level; `--write` stores the designer's lines, the higher targets and their lines in the plan.
//
//   nice -n 10 bun scripts/story-search.ts [--campaign 2] [--level 12] [--cap 120] [--write]
//
// Run it outside the tests, one at a time: a long level takes the whole cap.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beam, type BeamOptions } from "../src/engine/beam";
import { designer } from "../src/engine/designer";
import { solve } from "../src/engine/solver";
import { encodeLine, replayLine } from "../src/story/line";
import { CAMPAIGNS, twoStars, type StoryCampaign, type StoryLevel } from "../src/story/plan";

const PLAN = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "story", "plan.ts");

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const onlyCampaign = flag("campaign") ? Number(flag("campaign")) : null;
const onlyLevel = flag("level") ? Number(flag("level")) : null;
const capMs = Number(flag("cap") ?? 120) * 1000;
const write = args.includes("--write");

/** The beam settings, in the order they are tried: narrow and cheap first. */
function* portfolio(): Generator<BeamOptions & { label: string }> {
  for (const width of [16, 32, 64, 128, 256, 512, 1024]) {
    for (const perParent of [2, 4, Number.POSITIVE_INFINITY]) {
      for (const decay of [0.4, 0.5, 0.6, 0.7]) {
        for (const forest of [50, 150]) {
          const label = `beam w${width} p${perParent === Number.POSITIVE_INFINITY ? "all" : perParent} d${decay} f${forest}`;
          yield { label, width, perParent, estimate: { decay, forest, reach: 1 }, tail: 2, tailStates: 8 };
        }
      }
    }
  }
}

interface Found {
  score: number;
  line: string;
  method: string;
  nodes: number;
  ms: number;
  /** The designer's line and its score (best-known levels). */
  designer?: { line: string; score: number };
}

function search(level: StoryLevel): Found {
  const started = performance.now();
  if (level.method === "exact") {
    const solution = solve(level.deck, { placed: level.placed });
    return {
      score: solution.optimum,
      line: encodeLine(solution.moves),
      method: "exact (exhaustive)",
      nodes: solution.nodes,
      ms: Math.round(performance.now() - started),
    };
  }
  let best = { score: -1, line: "", method: "stored line" };
  if (level.line) best.score = replayLine(level.deck, level.line, level.placed).score;
  if (level.line) best.line = level.line;
  const drawn = designer(level.deck, level.placed);
  const designed = { line: encodeLine(drawn.moves), score: drawn.score };
  if (designed.score > best.score) best = { score: designed.score, line: designed.line, method: "designer line" };
  let nodes = 0;
  let last = 0;
  let tried = 0;
  for (const options of portfolio()) {
    const elapsed = performance.now() - started;
    // A setting costs about twice the last one (the width doubles every 24 settings): stop before the cap
    if (elapsed + last > capMs) break;
    const t = performance.now();
    const result = beam(level.deck, { ...options, placed: level.placed, seed: drawn.moves });
    last = performance.now() - t;
    nodes += result.nodes;
    tried += 1;
    if (result.score > best.score) best = { score: result.score, line: encodeLine(result.moves), method: options.label };
  }
  return { ...best, method: `${best.method} (${tried} settings)`, nodes, ms: Math.round(performance.now() - started), designer: designed };
}

/** The constant that holds each campaign's levels in the plan, by campaign id. */
const CONSTANTS: Record<number, string> = { 1: "TUTORIAL_LEVELS", 2: "OPEN_COUNTRY_LEVELS", 3: "DARK_FOREST_LEVELS" };

/** `source` with the target, method and line of `level` of `campaign` replaced. */
function store(source: string, campaign: StoryCampaign, level: StoryLevel, found: Found): string {
  if (!CONSTANTS[campaign.id]) throw new Error(`campaign ${campaign.id} has no levels constant here`);
  const constant = `const ${CONSTANTS[campaign.id]}`;
  const from = source.indexOf(`    id: ${level.id},\n`, source.indexOf(constant));
  const to = source.indexOf("\n  },", from);
  if (from < 0 || to < 0) throw new Error(`level ${campaign.id}-${level.id} not found in the plan`);
  const block = source
    .slice(from, to)
    .replace(/target: \d+,/, `target: ${found.score},`)
    .replace(/line: "[^"]*",/, `line: ${JSON.stringify(found.line)},`)
    .replace(/designer: "[^"]*",/, `designer: ${JSON.stringify(found.designer?.line ?? "")},`);
  return source.slice(0, from) + block + source.slice(to);
}

let source = readFileSync(PLAN, "utf8");
console.log("| Campaign | Level | Tiles | Target | 2 stars | Method | Nodes | Time | Designer |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const campaign of CAMPAIGNS) {
  if (onlyCampaign !== null && campaign.id !== onlyCampaign) continue;
  for (const level of campaign.levels) {
    if (onlyLevel !== null && level.id !== onlyLevel) continue;
    const found = search(level);
    const raised =
      found.score > level.target ||
      (level.method === "exact" && found.score !== level.target) ||
      !level.line ||
      (found.designer !== undefined && found.designer.line !== level.designer);
    console.log(
      `| ${campaign.name} | ${level.id} | ${level.deck.length + 1} | ${found.score}${found.score !== level.target ? " (new)" : ""} | ${twoStars(found.score)} | ${found.method} | ${found.nodes} | ${(found.ms / 1000).toFixed(1)} s | ${found.designer?.score ?? ""} |`,
    );
    if (raised) source = store(source, campaign, level, found);
  }
}
if (write) writeFileSync(PLAN, source);
