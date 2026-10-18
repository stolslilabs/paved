/**
 * The scan behind `locale-guard.test.ts` (P-66): finds the calls that format by the runtime's locale, or build an
 * `Intl` formatter, outside the formatter module.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Violation {
  file: string;
  line: number;
  rule: string;
  text: string;
}

const RULES: { rule: string; pattern: RegExp }[] = [
  // `toLocaleString()` with no locale formats by the user's; with one it is a locale named at the call site: both belong to the formatter.
  { rule: "toLocaleString, toLocaleDateString or toLocaleTimeString", pattern: /\.toLocale(?:String|DateString|TimeString)\s*\(/ },
  { rule: "Intl.NumberFormat, Intl.DateTimeFormat or Intl.RelativeTimeFormat", pattern: /\bIntl\s*\.\s*(?:NumberFormat|DateTimeFormat|RelativeTimeFormat)\b/ },
  // A formatter's output is final: a `.replace` on it swaps its separators (the no-break space of "1 270", P-82).
  {
    // The arguments stop at the call's own closing paren (two levels of nested parens), so a `.replace` on something else later in the line is not flagged.
    rule: "replace or replaceAll on a formatter's output",
    pattern: /\bformat(?:Number|Integer|Fixed|Compact|Percent|Bps|Units|Points|Date|Boundary|Relative)\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*\.replace(?:All)?\s*\(/,
  },
];

const EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;

/** Block comments and line comments out, keeping the line count: a rule quoted in a comment is not a call. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

export function scanSource(file: string, source: string): Violation[] {
  const lines = stripComments(source).split("\n");
  const found: Violation[] = [];
  lines.forEach((text, index) => {
    for (const { rule, pattern } of RULES) {
      if (pattern.test(text)) found.push({ file, line: index + 1, rule, text: text.trim() });
    }
  });
  return found;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (EXTENSIONS.test(entry.name)) yield path;
  }
}

/** Every violation under `dirs`, except in `exempt` (paths relative to `root`). */
export function scanDirs(root: string, dirs: string[], exempt: string[]): Violation[] {
  const found: Violation[] = [];
  for (const dir of dirs) {
    for (const path of walk(join(root, dir))) {
      const relative = path.slice(root.length + 1);
      if (exempt.includes(relative)) continue;
      found.push(...scanSource(relative, readFileSync(path, "utf8")));
    }
  }
  return found;
}
