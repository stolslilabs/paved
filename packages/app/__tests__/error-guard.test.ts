import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P-67: every error of the app is shown by `InlineError` (`src/components/elements/inline-error.tsx`); no component
 * under `src/components` or `src/routes` renders one by itself. Enforced on the source:
 *
 * - no error role (`role="alert"`, `role: "alert"`, `role={"alert"}`) and no `aria-live="assertive"` outside `InlineError`;
 * - no `toast.error(` or `toast.warning(`: an error toast is `toastError` (`containers/error-toast.tsx`), which holds
 *   `InlineError`;
 * - no danger tone on `Notice`, on one line or over several (a `Notice` is a state, never an error);
 * - the error colours (`text-destructive`, `text-destructive-text`, `text-destructive-foreground`, `border-destructive`,
 *   `border-destructive-text`) only in `InlineError` and in the uses listed in `ALLOWED`, none of which shows an error.
 *
 * It scans `src/components`, `src/routes` and `src/wallet`.
 */

const ROOT = join(import.meta.dirname, "..");
const SHARED = "src/components/elements/inline-error.tsx";

/** The error colours' uses that are not errors, with how many each file has. */
const ALLOWED: Record<string, { count: number; why: string }> = {
  "src/components/containers/device-settings-sheet.tsx": { count: 2, why: "the board's Surrender row, its icon and its label (a destructive action, #606)" },
  "src/components/elements/stat-row.tsx": { count: 1, why: "StatRow's danger tone: a stat (missed by), not an error" },
  "src/components/elements/countdown.tsx": { count: 1, why: "an expired deadline" },
  "src/components/containers/reward-panel.tsx": { count: 2, why: "a threshold missed: the icon and the points" },
  "src/components/containers/vault-form.tsx": { count: 1, why: "the invalid amount field's border, beside its InlineError" },
  "src/components/elements/tile-chip.tsx": { count: 1, why: "a refused tile chip's border (the tile stack's state)" },
  "src/components/containers/guild-page-sheets.tsx": { count: 1, why: "the guild menu's Leave or Disband label (a destructive action, #973)" },
  "src/components/ui/dropdown-menu.tsx": { count: 2, why: "a destructive menu item and its focus" },
  "src/components/ui/badge.tsx": { count: 1, why: "the destructive badge's text on its own fill" },
  "src/components/ui/button.tsx": { count: 1, why: "the destructive button's text on its own fill" },
};

const COLOUR = /\b(?:text|border)-destructive(?:-text|-foreground)?\b/g;

export interface Finding {
  file: string;
  rule: string;
  line: number;
}

/** The error renderings of one source file outside the shared component. */
export function errorRenderings(file: string, src: string): Finding[] {
  if (file === SHARED) return [];
  const out: Finding[] = [];
  const lineOf = (index: number) => src.slice(0, index).split("\n").length;
  // Over the whole source, so a tag or a call split over lines is caught too.
  const rules: [string, RegExp][] = [
    ["error role", /role\s*[=:]\s*\{?\s*["'`]alert["'`]/g],
    ["assertive live region", /aria-live\s*[=:]\s*\{?\s*["'`]assertive["'`]/g],
    ["toast.error", /\btoast\s*\.\s*(?:error|warning)\s*\(/g],
    ["danger Notice", /<Notice\b[^>]*?\btone\s*=\s*\{?\s*["'`]danger["'`]/g],
  ];
  // Notice's own variants: a danger tone there would come back to every caller.
  if (file === "src/components/elements/notice.tsx") rules.push(["danger Notice", /\bdanger\s*:/g]);
  for (const [rule, re] of rules) for (const m of src.matchAll(re)) out.push({ file, rule, line: lineOf(m.index) });
  const uses = [...src.matchAll(COLOUR)].map((m) => lineOf(m.index));
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
    const files = ["src/components", "src/routes", "src/wallet"].flatMap((d) => sources(join(ROOT, d)));
    expect(files.length).toBeGreaterThan(50);
    const found = files.flatMap((f) => errorRenderings(rel(f), readFileSync(f, "utf8")));
    expect(found).toEqual([]);
  });

  it("the allowed uses of the error colour are still there (a stale entry is removed)", () => {
    for (const [file, { count }] of Object.entries(ALLOWED)) {
      const uses = readFileSync(join(ROOT, file), "utf8").match(COLOUR)?.length ?? 0;
      expect({ file, uses }).toEqual({ file, uses: count });
    }
  });

  it("fails on a fixture that renders an error by itself", () => {
    const fixture = [
      'export function Bad({ error }: { error: string }) {',
      '  return <p role="alert" className="text-sm text-destructive-text">{error}</p>;',
      '}',
      'const t = () => toast.error("Refused");',
      'const w = () => toast.warning("Refused");',
      'const n = <Notice tone="danger" title="Refused">x</Notice>;',
      'const m = (',
      '  <Notice',
      '    title="Refused"',
      '    tone="danger"',
      '  >',
      '    x',
      '  </Notice>',
      ');',
      'const b = <div className="border-destructive text-destructive">x</div>;',
      'const l = <div aria-live="assertive">x</div>;',
    ].join("\n");
    const found = errorRenderings("src/components/containers/bad.tsx", fixture);
    expect(found.map((f) => `${f.rule}:${f.line}`).sort()).toEqual(
      ["assertive live region:16", "danger Notice:6", "danger Notice:8", "error colour:15", "error colour:15", "error colour:2", "error role:2", "toast.error:4", "toast.error:5"].sort(),
    );
  });

  it("lets InlineError itself use the role and the token", () => {
    expect(errorRenderings(SHARED, readFileSync(join(ROOT, SHARED), "utf8"))).toEqual([]);
    expect(readFileSync(join(ROOT, SHARED), "utf8")).toMatch(/role="alert"[^\n]*text-destructive-text/);
  });
});
