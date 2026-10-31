import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// CSS-CLEANUP: the app's stylesheet (src/styles/index.css) keeps out the utilities the scanner reads in words that are no class
// names. This holds the list to it: none of its words is a class in the app's sources (stories aside: Storybook scans them itself).
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

/** The class names of a source: each string literal that is a list of class names, or one class after `className=`, `cn(`, `&&`. */
function classes(source: string): Set<string> {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/.*$/gm, "$1");
  const found = new Set<string>();
  for (const m of code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const tokens = (m[1] ?? m[2] ?? m[3]!).split(/\s+/).filter(Boolean);
    const single = tokens.length === 1 && /(className=\{?|cn\(\s*|&&\s*)$/.test(code.slice(Math.max(0, m.index - 12), m.index));
    if ((tokens.length > 1 || single) && tokens.every(classLike)) for (const t of tokens) found.add(t);
  }
  return found;
}

describe("the app stylesheet's sources", () => {
  const files = appFiles(SRC).map((path) => ({ path: relative(SRC, path), classes: classes(readFileSync(path, "utf8")) }));

  it("reads the classes of the app's sources", () => {
    const all = new Set(files.flatMap((f) => [...f.classes]));
    for (const used of ["flex", "hidden", "invisible", "shadow-sm", "ring-1", "desktop:static"]) expect(all).toContain(used);
  });

  it("leaves out no utility the app uses as a class", () => {
    const used = files.flatMap((f) => excluded.filter((w) => f.classes.has(w)).map((w) => `${f.path}: ${w}`));
    expect(used).toEqual([]);
  });
});
