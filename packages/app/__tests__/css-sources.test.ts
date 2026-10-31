import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// CSS-CLEANUP: the app's stylesheet (src/styles/index.css) keeps out the utilities the scanner reads in words that are no class
// names. This holds the list to it, strictly: a string of the app's sources (stories aside: Storybook scans them itself) that
// holds one of its words fails, unless it plainly is no class list. A class map, a ternary or a `cn()` argument fails.
const SRC = resolve(import.meta.dirname, "../src");
const index = readFileSync(join(SRC, "styles/index.css"), "utf8");
const excluded = index.match(/@source not inline\("([^"]+)"\)/)![1]!.split(" ");

function appFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return ["stories", "directions"].includes(relative(SRC, path)) ? [] : appFiles(path);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".stories.tsx") ? [path] : [];
  });
}

/** A class name: variants and a utility, its arbitrary values in brackets or parentheses. */
const classLike = (token: string) => /^!?[a-z0-9-][\w\-:/.!*&>@]*$/.test(token.replace(/\[[^\]]*\]|\([^)]*\)/g, "x"));

/** Props, attributes and fields whose string is never a class: a variant's name, an ARIA role, an SVG or style value, a state. */
const NOT_CLASS_KEYS = new Set(["variant", "role", "overflow", "visibility", "willChange", "kind", "state", "playbackState"]);

/**
 * Whether a string at `at` is plainly no class list, from what precedes it in its statement. Its own operand only: the value
 * it is compared with (`state !== "running"`), a member of a type union, the attribute `setAttribute(` names. Otherwise the key
 * it is the value of, past any ternary or comparison in between: one of NOT_CLASS_KEYS, a `data-*` or an `aria-*` attribute,
 * also as `setAttribute("visibility", …)`. Any other key (`className`, a class map's `root:`, `setAttribute("class", …)`) or
 * none at all (a `cn()` argument) is a class list.
 */
function plainlyNotClass(code: string, at: number): boolean {
  const before = code.slice(Math.max(0, at - 160), at).split(/;|\n\s*\n/).pop()!;
  if (/(?:[!=]==?|\||setAttribute\()\s*$/.test(before)) return true;
  const keys = [...before.matchAll(/([\w.-]+)\s*(?:=(?![=>])|:(?!\s*["'`]))\s*\{?|setAttribute\(\s*["']([\w-]+)["']\s*,/g)];
  const last = keys.at(-1);
  if (!last) return false;
  const key = (last[2] ?? last[1]!).split(".").pop()!;
  return NOT_CLASS_KEYS.has(key) || /^(data|aria)-/.test(key);
}

/** The excluded words a source uses in a string that may be a class list. */
function excludedUses(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/.*$/gm, "$1");
  const found: string[] = [];
  for (const m of code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const tokens = (m[1] ?? m[2] ?? m[3]!).replace(/\$\{[^}]*\}/g, " ").split(/\s+/).filter(Boolean);
    const words = excluded.filter((w) => tokens.includes(w));
    // Prose or a CSS value ("Purchases paused", "transform 200ms ease-out, …") holds a token no class can be.
    if (words.length === 0 || !tokens.every(classLike) || plainlyNotClass(code, m.index)) continue;
    found.push(...words);
  }
  return found;
}

describe("the app stylesheet's word list", () => {
  it("catches a word used as a class, however the class is written", () => {
    expect(excludedUses(`<p className="static" />`)).toEqual(["static"]);
    expect(excludedUses(`<p className={active ? "static" : "relative"} />`)).toEqual(["static"]);
    expect(excludedUses(`const classes = { root: "table" };`)).toEqual(["table"]);
    expect(excludedUses(`cn("flex", active ? "visible" : "invisible")`)).toEqual(["visible"]);
    expect(excludedUses(`cn("p-2", ok && "outline")`)).toEqual(["outline"]);
    // A comparison in the condition excuses only the string it compares with.
    expect(excludedUses(`<p className={mode === "idle" ? "static" : "relative"} />`)).toEqual(["static"]);
    expect(excludedUses(`cn("flex", mode === "idle" && "visible")`)).toEqual(["visible"]);
    expect(excludedUses(`cn(state !== "running" ? "paused" : "flex")`)).toEqual(["paused"]);
    expect(excludedUses(`el.setAttribute("class", on ? "visible" : "hidden");`)).toEqual(["visible"]);
    expect(excludedUses("const CARD = `flex shadow ${x}`;")).toEqual(["shadow"]);
    expect(excludedUses(`<div className="ring-1 transform" />`)).toEqual(["transform"]);
  });

  it("lets the word be what it is elsewhere: a variant, a role, a value, a state, prose", () => {
    const fine = [
      `<Button variant="outline" />`,
      `<Badge variant={disabled ? "secondary" : featured ? "default" : "outline"}>`,
      `function Next({ className, variant = "outline" }) {}`,
      `<div role="table" className="grid" />`,
      `<svg overflow="visible" />`,
      `g.setAttribute("visibility", matrix ? "visible" : "hidden");`,
      `el.style.visibility = "visible";`,
      `if (ctx.state !== "running") resume();`,
      `type Kind = "moved" | "paused";`,
      `return { kind: "paused", message };`,
      `<div data-unlock={on ? (playing ? "playing" : "paused") : undefined} />`,
      `<Notice title="Purchases paused" />`,
      `el.style.transition = "transform 200ms ease-out, width 200ms ease-out";`,
      "<polygon filter={`url(#${shadow})`} />",
    ];
    for (const source of fine) expect(excludedUses(source), source).toEqual([]);
  });

  it("is used as no class in the app's sources", () => {
    const used = appFiles(SRC).flatMap((path) => excludedUses(readFileSync(path, "utf8")).map((w) => `${relative(SRC, path)}: ${w}`));
    expect(used).toEqual([]);
  });
});
