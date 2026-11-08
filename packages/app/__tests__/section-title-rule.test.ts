import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TILE-COUNTS (the owner's rule of 2026-11-07): a section's title is a fixed word. No count, X/Y, total, timer or amount in a
 * `SectionTitle` (`src/components/elements/section-title.tsx`), nor in its `end` slot, which holds a control at most. Such a figure
 * goes into the section's content (a carved box, a chip on its first line, a row's pill) or is dropped.
 *
 * Enforced on the source of `src/components` and `src/routes` (stories included: they must not teach the pattern): every
 * `<SectionTitle …>…</SectionTitle>` is read, its children and its `end` attribute, and none may hold a figure's marks: the
 * `numeric` class, a formatter call (`formatInteger(`, `formatNumber(`, …), a template string's `${`, an "X/Y" (`}/{` or digits
 * over digits), a `.length`, digits in the JSX text, a part that shows a figure (`Countdown`, `CharCount`, `SlotsUsed`, a
 * `Count`), or a wrapper's prop spliced in beside the title (`{title}{count}`). JSX comments are ignored.
 */

const ROOT = join(import.meta.dirname, "..");

/** The `end` slots that hold a control whose name carries a value, with why each is not a figure. */
const ALLOWED_END: Record<string, { count: number; why: string }> = {
  "src/components/containers/profile-sheet.tsx": {
    count: 1,
    why: "the Stats' span: a filter's chip ('All time', 'Season 3') with its cross back to all time, set from the Hall of Fame; a control naming the season picked, not a figure",
  },
};

const FIGURE: readonly { name: string; re: RegExp }[] = [
  { name: "the numeric class", re: /\bnumeric\b/ },
  { name: "a formatter call", re: /\bformat[A-Z]\w*\(/ },
  { name: "a template string's ${", re: /\$\{/ },
  { name: "an X/Y", re: /\}\s*\/\s*\{|\b\d+\s*\/\s*\d+\b/ },
  { name: "a .length", re: /\.length\b/ },
  { name: "a part that shows a figure", re: /<(?:Countdown|CharCount|SlotsUsed|Count|NumberTicker)\b/ },
  // A wrapper's prop spliced in beside the title (`{title}{count}`, `{title}{end}`): how Missions and the guild's form did it.
  { name: "a count passed in", re: /\{\s*(?:count|counts|total|done|end|badge|figure)\s*\}/ },
];

/** Digits in the JSX text (between `>` and `<` or `{`), as "Tiles 72". */
const TEXT_DIGITS = />[^<>{}]*\d[^<>{}]*(?=[<{])/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** The end of a JSX opening tag starting at `from` (its `>` or `/>`), skipping braces and strings; with whether it closes itself. */
function openingTagEnd(text: string, from: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && c === ">") return { end: i + 1, selfClosing: text[i - 1] === "/" };
  }
  throw new Error(`unterminated tag at ${from}`);
}

/** The value of `name={…}` in an opening tag's attributes, braces balanced; null without one. */
function attribute(attrs: string, name: string): string | null {
  const start = attrs.search(new RegExp(`\\s${name}=\\{`));
  if (start < 0) return null;
  const open = attrs.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < attrs.length; i++) {
    if (attrs[i] === "{") depth++;
    else if (attrs[i] === "}" && --depth === 0) return attrs.slice(open + 1, i);
  }
  return attrs.slice(open + 1);
}

const withoutComments = (code: string) => code.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

export interface Finding {
  file: string;
  line: number;
  where: "title" | "end";
  rule: string;
}

/** Every `SectionTitle` of a source and the figure's marks found in its children or its `end`. */
export function findFigures(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const re = /<SectionTitle\b/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const line = text.slice(0, m.index).split("\n").length;
    const { end, selfClosing } = openingTagEnd(text, m.index);
    const attrs = text.slice(m.index + "<SectionTitle".length, end);
    const close = selfClosing ? end : text.indexOf("</SectionTitle>", end);
    const children = withoutComments(selfClosing ? (attribute(attrs, "children") ?? "") : text.slice(end, close));
    const endSlot = attribute(attrs, "end");
    for (const { name, re: rule } of FIGURE) if (rule.test(children)) findings.push({ file, line, where: "title", rule: name });
    if (TEXT_DIGITS.test(`>${children}<`)) findings.push({ file, line, where: "title", rule: "digits in the text" });
    if (endSlot !== null) {
      const code = withoutComments(endSlot);
      for (const { name, re: rule } of FIGURE) if (rule.test(code)) findings.push({ file, line, where: "end", rule: name });
    }
  }
  return findings;
}

describe("section titles hold no changing figure (TILE-COUNTS)", () => {
  const files = [...sources(join(ROOT, "src/components")), ...sources(join(ROOT, "src/routes"))];
  const all = files.flatMap((path) => findFigures(relative(ROOT, path), readFileSync(path, "utf8")));

  it("reads the titles it guards", () => {
    // The scan finds the app's section titles (about forty), so a change of the component's name cannot empty it silently.
    const titles = files.reduce((n, path) => n + (readFileSync(path, "utf8").match(/<SectionTitle\b/g)?.length ?? 0), 0);
    expect(titles).toBeGreaterThan(30);
  });

  it("no title holds a count, an X/Y, a total, a timer or an amount", () => {
    expect(all.filter((f) => f.where === "title")).toEqual([]);
  });

  it("no end slot holds one either, but the listed controls", () => {
    const ends = all.filter((f) => f.where === "end");
    const byFile = Object.groupBy(ends, (f) => f.file);
    const unexpected = Object.entries(byFile).flatMap(([file, found = []]) => {
      const allowed = ALLOWED_END[file];
      const lines = [...new Set(found.map((f) => f.line))];
      return allowed && lines.length === allowed.count ? [] : found;
    });
    expect(unexpected).toEqual([]);
  });

  it("catches the patterns it was written for", () => {
    const cases: [string, string][] = [
      ["count beside", `<SectionTitle id="a">Skins <span className="numeric">{done}/{of}</span></SectionTitle>`],
      ["formatter", `<SectionTitle>{title}<span>{formatInteger(items.length)}</span></SectionTitle>`],
      ["a Count part", `<SectionTitle id="deck">Tiles <Count value={72} /></SectionTitle>`],
      ["digits", `<SectionTitle>Tiles 72</SectionTitle>`],
      ["template", "<SectionTitle>{`Members ${n}`}</SectionTitle>"],
      ["timer at the end", `<SectionTitle end={<Countdown expiresAt={ends} now={now} short />}>Daily</SectionTitle>`],
      ["X/Y at the end", `<SectionTitle end={<CharCount count={n} max={15} />}>Name</SectionTitle>`],
      ["a wrapper's count", `<SectionTitle id={id} end={end}>{title}{count}</SectionTitle>`],
      ["a wrapper's end in the title", `<SectionTitle>{title}{end}</SectionTitle>`],
    ];
    for (const [name, code] of cases) expect(findFigures(name, code), name).not.toEqual([]);
    // A fixed word, a painted icon before it (its size in digits), a control at the end: clean.
    const clean = `<SectionTitle id="x" end={<Button onClick={go}>Edit</Button>}>
      <UiIcon name="crown" px={28} className="drawer-icon size-7 self-center" />
      {/* a comment with 3/8 in it */}
      Ranked
    </SectionTitle>`;
    expect(findFigures("clean", clean)).toEqual([]);
  });
});
