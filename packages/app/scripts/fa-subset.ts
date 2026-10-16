/**
 * The Font Awesome subset (docs/client/v2-architecture.md, section 8): `public/fontawesome/js/solid.min.js` and
 * `thin.min.js` are derivatives of the owner's Font Awesome Pro files kept whole in `public/fontawesome/source/`,
 * cut to the icons the app names. The source files are not served: the build leaves them out of `dist/`.
 *
 *   node scripts/fa-subset.ts            write the subset files
 *   node scripts/fa-subset.ts --check    fail when a committed subset differs from what the source and the code give
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable. No package.
 *
 * Each file is the source with its icon table (`var w={...}`) reduced to the used entries, in name order, every entry
 * copied as the source has it. The licence header comes first and is untouched; a note on the subset follows it.
 * `--check` compares content (the files regenerated in memory against the committed ones), never compressed sizes.
 *
 * Which icons are "used" is `usedIcons`: the string literals of `src/` that are Font Awesome names on a line about an icon
 * (an `Icon` tag, an `icon` prop or key, an `ICON` table, the block such a line opens). `__tests__/fa-subset.test.ts`
 * holds the rule to the code.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FA_DIR = join(ROOT, "public/fontawesome");
export const VARIANTS = ["solid", "thin"] as const;
export type Variant = (typeof VARIANTS)[number];

/**
 * Files scanned whole, not only the icon lines: the Icons story lists its names in a plain array, and a name missing
 * from the subset would draw an empty box there.
 */
export const SCAN_WHOLE = ["src/components/ui/icon.stories.tsx"];
/** Not icon names: `icon` here is a Button size. */
export const SCAN_SKIP = ["src/lib/font-awesome.ts", "src/components/ui/button.tsx"];

const END = "};!function(c){try{";

export interface IconFile {
  /** Everything before the table, the licence header included. */
  head: string;
  /** Everything after it. */
  tail: string;
  /** The table's entries as written: name (or number) to the entry's array text. */
  entries: Map<string, string>;
}

/** Cut a Font Awesome icon file (`var w={"name":[w,h,[aliases],"unicode","path"],...};...`) into its three parts. */
export function parseIconFile(text: string): IconFile {
  const start = text.lastIndexOf("var w={") + "var w=".length;
  const end = text.lastIndexOf(END);
  if (start < "var w=".length || end < start) throw new Error("not a Font Awesome icon file: no `var w={...}` table");
  const body = text.slice(start + 1, end);
  const entries = new Map<string, string>();
  // An entry is `name:[width,height,[aliases],"hex","path"]`: the path has no quote, so a regex reads it whole.
  const re = /(?:"([^"]+)"|([A-Za-z0-9_$]+)):(\[\d+,\d+,\[[^\]]*\],"[0-9a-f]+","[^"]*"\]),?/gy;
  let at = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    entries.set(m[1] ?? m[2]!, m[3]!);
    at = re.lastIndex;
  }
  if (at !== body.length) throw new Error(`the icon table does not parse: stopped at ${at} of ${body.length}`);
  return { head: text.slice(0, start), tail: text.slice(end + 1), entries };
}

/** The names an entry answers to: its key and its string aliases. */
export function namesOf(key: string, entry: string): string[] {
  const aliases = /^\[\d+,\d+,\[([^\]]*)\]/.exec(entry)![1]!;
  return [key, ...[...aliases.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)];
}

/** Every name a file answers to, aliases included, with the key of its entry. */
export function nameIndex(file: IconFile): Map<string, string> {
  const index = new Map<string, string>();
  for (const [key, entry] of file.entries) for (const name of namesOf(key, entry)) index.set(name, key);
  return index;
}

/** The source without comments (their line count kept): a name in a comment is not a use. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\w])\/\/.*$/gm, "$1");
}

/** The lines of `src` that are about an icon: the line says `icon`, or it is inside the `{`/`[` block such a line opens. */
export function iconLines(src: string): string[] {
  const out: string[] = [];
  let blockIndent = -1;
  for (const line of stripComments(src).split("\n")) {
    const indent = line.length - line.trimStart().length;
    let inBlock = false;
    if (blockIndent >= 0) {
      if (/^\s*[\]})]/.test(line) && indent <= blockIndent) blockIndent = -1;
      else inBlock = true;
    }
    const about = /icon/i.test(line);
    if (about || inBlock) out.push(line);
    if (about && blockIndent < 0 && /[{[(]\s*$/.test(line)) blockIndent = indent;
  }
  return out;
}

/** Props and keys that take a word which is also an icon's name ("ghost" button, the "home" tab): not an icon. */
const NOT_ICON_PROPS = /\b(?:variant|size|id|tone|type|active|mode|state)\s*[=:]\s*\{?\s*"[^"]*"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(e.name) ? [path] : [];
  });
}

const posix = (p: string) => p.split("\\").join("/");

/** The string literals of the code that name an icon of `known`, with the files that name them. */
export function usedIcons(known: ReadonlySet<string>, root: string = ROOT): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of sourceFiles(join(root, "src"))) {
    const rel = posix(relative(root, file));
    if (SCAN_SKIP.includes(rel)) continue;
    const src = readFileSync(file, "utf8");
    const text = SCAN_WHOLE.includes(rel) ? stripComments(src) : iconLines(src).join("\n");
    for (const m of text.replace(NOT_ICON_PROPS, "").matchAll(/"([a-z][a-z0-9-]*)"/g)) {
      if (!known.has(m[1]!)) continue;
      const where = used.get(m[1]!) ?? [];
      if (!where.includes(rel)) where.push(rel);
      used.set(m[1]!, where);
    }
  }
  return used;
}

/**
 * The literals that must be icons: an `<Icon name="…">`, an `icon="…"` or an `icon: "…"` whose value is a string. A name
 * that is not in the source file is a typo, and draws an empty box.
 */
export function explicitIconNames(root: string = ROOT): { name: string; file: string }[] {
  const out: { name: string; file: string }[] = [];
  for (const file of sourceFiles(join(root, "src"))) {
    const rel = posix(relative(root, file));
    if (SCAN_SKIP.includes(rel)) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/<Icon\b[^>]*?\bname="([^"]+)"|\bicon(?:=|:\s*)"([^"]+)"/g)) out.push({ name: (m[1] ?? m[2])!, file: rel });
  }
  return out;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export const readSource = (variant: Variant) => readFileSync(join(FA_DIR, "source", `${variant}.min.js`), "utf8");
export const subsetPath = (variant: Variant) => join(FA_DIR, "js", `${variant}.min.js`);

/** The subset file of `variant` for the names in `used`. */
export function buildSubset(variant: Variant, sourceText: string, used: ReadonlySet<string>): string {
  const source = parseIconFile(sourceText);
  const keys = new Set<string>();
  for (const [name, key] of nameIndex(source)) if (used.has(name)) keys.add(key);
  const kept = [...keys].sort();
  const table = kept.map((k) => `${/^[A-Za-z0-9_$]+$/.test(k) ? k : JSON.stringify(k)}:${source.entries.get(k)!}`).join(",");
  // The licence header is the source's first comment, kept as it is.
  const headEnd = source.head.indexOf("*/") + 2;
  const note =
    `\n/* Subset for the Paved app, made by scripts/fa-subset.ts from source/${variant}.min.js (SHA-256 ${sha256(sourceText)}): ` +
    `${kept.length} of ${source.entries.size} icons. The code between the header and the table is the source's. */`;
  return `${source.head.slice(0, headEnd)}${note}${source.head.slice(headEnd)}{${table}}${source.tail}`;
}

export interface Plan {
  variant: Variant;
  path: string;
  text: string;
  /** The names kept, one per entry. */
  kept: string[];
  sourceBytes: number;
}

/** What the subset files should hold, from the source files and the code. */
export function plan(root: string = ROOT): Plan[] {
  const sources = VARIANTS.map((v) => ({ variant: v, text: readSource(v) }));
  const known = new Set(sources.flatMap((s) => [...nameIndex(parseIconFile(s.text)).keys()]));
  const used = new Set(usedIcons(known, root).keys());
  return sources.map(({ variant, text }) => {
    const text2 = buildSubset(variant, text, used);
    return { variant, path: subsetPath(variant), text: text2, kept: [...parseIconFile(text2).entries.keys()].sort(), sourceBytes: Buffer.byteLength(text) };
  });
}

function main() {
  const check = process.argv.includes("--check");
  let stale = false;
  for (const p of plan()) {
    const bytes = Buffer.byteLength(p.text);
    if (check) {
      const current = (() => {
        try {
          return readFileSync(p.path, "utf8");
        } catch {
          return null;
        }
      })();
      if (current !== p.text) {
        stale = true;
        console.error(`${relative(ROOT, p.path)} is stale: it is not what the source file and the code's icons give.`);
      }
    } else {
      writeFileSync(p.path, p.text);
    }
    console.log(`${p.variant}: ${p.sourceBytes} -> ${bytes} bytes, ${p.kept.length} icons${check ? "" : " written"}`);
  }
  if (stale) {
    console.error("Run `bun run fa-subset` in packages/app and commit the files.");
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
