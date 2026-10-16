import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P-67: every error of the app is shown by `InlineError` (`src/components/elements/inline-error.tsx`); no component
 * under `src/components` or `src/routes` renders one by itself. Enforced on the source:
 *
 * - no error role (`role="alert"`, `role: "alert"`, `role={"alert"}`) outside `InlineError`;
 * - no `toast.error(`: an error toast is `toastError` (`containers/error-toast.tsx`), which holds `InlineError`;
 * - no danger tone on `Notice` (a `Notice` is a state, never an error);
 * - the error colour token (`text-destructive-text`) only in `InlineError` and in the uses listed in `ALLOWED`, none
 *   of which shows an error.
 */

const ROOT = join(import.meta.dirname, "..");
const SHARED = "src/components/elements/inline-error.tsx";

/** The token's uses that are not errors, with how many each file has. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  "src/components/containers/hand-panel.tsx": { count: 2, why: "the Surrender button's text and its hover (a destructive action)" },
  "src/components/elements/stat-row.tsx": { count: 1, why: "StatRow's danger tone: a stat (missed by), not an error" },
  "src/components/elements/countdown.tsx": { count: 1, why: "an expired deadline" },
  "src/components/containers/reward-panel.tsx": { count: 2, why: "a threshold missed: the icon and the points" },
  "src/components/ui/dropdown-menu.tsx": { count: 1, why: "a destructive menu item" },
};

export interface Finding {
  file: string;
  rule: string;
  line: number;
}

/** The error renderings of one source file outside the shared component. */
export function errorRenderings(file: string, src: string): Finding[] {
  if (file === SHARED) return [];
  const out: Finding[] = [];
  const lines = src.split("\n");
  const rules: [string, RegExp][] = [
    ["error role", /role\s*[=:]\s*\{?\s*["'`]alert["'`]/],
    ["toast.error", /\btoast\.error\s*\(/],
    ["danger Notice", /<Notice\b[^>]*\btone\s*=\s*\{?\s*["'`]danger["'`]/],
  ];
  // Notice's own variants: a danger tone there would come back to every caller.
  if (file === "src/components/elements/notice.tsx") rules.push(["danger Notice", /\bdanger\s*:/]);
  lines.forEach((text, i) => {
    for (const [rule, re] of rules) if (re.test(text)) out.push({ file, rule, line: i + 1 });
  });
  const uses = lines.flatMap((text, i) => [...text.matchAll(/text-destructive-text/g)].map(() => i + 1));
  const allowed = ALLOWED[file]?.count ?? 0;
  if (uses.length > allowed) for (const line of uses.slice(allowed)) out.push({ file, rule: "error colour", line });
  return out;
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

describe("one error component (P-67)", () => {
  it("no component or route renders an error outside InlineError", () => {
    const files = ["src/components", "src/routes"].flatMap((d) => sources(join(ROOT, d)));
    expect(files.length).toBeGreaterThan(50);
    const found = files.flatMap((f) => errorRenderings(rel(f), readFileSync(f, "utf8")));
    expect(found).toEqual([]);
  });

  it("the allowed uses of the error colour are still there (a stale entry is removed)", () => {
    for (const [file, { count }] of Object.entries(ALLOWED)) {
      const uses = readFileSync(join(ROOT, file), "utf8").match(/text-destructive-text/g)?.length ?? 0;
      expect({ file, uses }).toEqual({ file, uses: count });
    }
  });

  it("fails on a fixture that renders an error by itself", () => {
    const fixture = [
      'export function Bad({ error }: { error: string }) {',
      '  return <p role="alert" className="text-sm text-destructive-text">{error}</p>;',
      '}',
      'const t = () => toast.error("Refused");',
      'const n = <Notice tone="danger" title="Refused">x</Notice>;',
    ].join("\n");
    const rules = errorRenderings("src/components/containers/bad.tsx", fixture).map((f) => f.rule);
    expect(rules.sort()).toEqual(["danger Notice", "error colour", "error role", "toast.error"]);
  });

  it("lets InlineError itself use the role and the token", () => {
    expect(errorRenderings(SHARED, readFileSync(join(ROOT, SHARED), "utf8"))).toEqual([]);
    expect(readFileSync(join(ROOT, SHARED), "utf8")).toMatch(/role="alert"[^\n]*text-destructive-text/);
  });
});
