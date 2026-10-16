import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSubset,
  explicitIconNames,
  iconLines,
  nameIndex,
  parseIconFile,
  plan,
  rowStarts,
  readSource,
  subsetPath,
  usedIcons,
  VARIANTS,
} from "../scripts/fa-subset";

const HOW = "Run `bun run fa-subset` in packages/app and commit the files.";
const source = Object.fromEntries(VARIANTS.map((v) => [v, parseIconFile(readSource(v))]));
const subset = Object.fromEntries(VARIANTS.map((v) => [v, parseIconFile(readFileSync(subsetPath(v), "utf8"))]));
const known = new Set(VARIANTS.flatMap((v) => [...nameIndex(source[v]!).keys()]));

describe("the Font Awesome subset", () => {
  it("is what the owner's files and the code's icons give (a stale subset fails here and in the build)", () => {
    for (const p of plan()) expect(readFileSync(p.path, "utf8") === p.text, `${p.variant}.min.js is stale. ${HOW}`).toBe(true);
  });

  it("has every icon a component names, with the file that names it when one is missing", () => {
    const solid = nameIndex(subset.solid!);
    const missing = [...usedIcons(known)].filter(([name]) => !solid.has(name)).map(([name, files]) => `${name} (${files.join(", ")})`);
    expect(missing, `icons named in src/ and missing from the subset. ${HOW}`).toEqual([]);
  });

  it("names only icons that exist: an Icon, an icon prop or an icon key whose literal is not in the owner's file is a typo", () => {
    const solid = nameIndex(source.solid!);
    const thin = nameIndex(source.thin!);
    const typos = explicitIconNames().filter(({ name }) => !solid.has(name) && !thin.has(name)).map(({ name, file }) => `${name} (${file})`);
    expect(typos).toEqual([]);
  });

  it("carries no icon that no code names", () => {
    const used = new Set(usedIcons(known).keys());
    for (const v of VARIANTS) {
      const index = nameIndex(source[v]!);
      const wanted = new Set([...used].filter((n) => index.has(n)).map((n) => index.get(n)));
      expect(new Set(subset[v]!.entries.keys())).toEqual(wanted);
    }
  });

  it("copies each entry as the owner's file has it, and keeps the licence header first", () => {
    for (const v of VARIANTS) {
      for (const [key, entry] of subset[v]!.entries) expect(source[v]!.entries.get(key)).toBe(entry);
      const text = readFileSync(subsetPath(v), "utf8");
      expect(text.startsWith(source[v]!.head.slice(0, source[v]!.head.indexOf("*/") + 2))).toBe(true);
      expect(text).toContain("License - https://fontawesome.com/license (Commercial License)");
      expect(text).toContain("Subset for the Paved app");
    }
  });

  it("is much smaller than the owner's file", () => {
    expect(readFileSync(subsetPath("solid"), "utf8").length).toBeLessThan(readSource("solid").length / 20);
  });

  it("keeps an icon reachable by its alias", () => {
    const tiny = parseIconFile(buildSubset("solid", readSource("solid"), new Set(["warning"])));
    expect([...tiny.entries.keys()]).toEqual(["triangle-exclamation"]);
  });
});

describe("what counts as a use", () => {
  it("reads an icon prop, a table behind an icon line, and a block an icon line opens", () => {
    const lines = iconLines(['<Icon name="house" />', "const ICON = {", '  info: "info",', "};", 'const other = "star";'].join("\n"));
    expect(lines.join("\n")).toContain('"info"');
    expect(lines.join("\n")).toContain('"house"');
    expect(lines.join("\n")).not.toContain('"star"');
  });

  it("ignores comments", () => {
    expect(iconLines('// icon: "house"\n/* <Icon name="star" /> */').join("")).not.toMatch(/house|star/);
  });
});

describe("a table read by a later map", () => {
  const TABLE = [
    "export function Earned({ games, packs }) {",
    "  return (",
    "    <ul>",
    "      {(",
    "        [",
    '          ["bell", "Challenge games", games, "game"],',
    '          ["anchor", "Cobbles packs", packs, "pack"],',
    "        ] as const",
    "      ).map(([icon, label]) => (",
    "        <li><Icon name={icon} />{label}</li>",
    "      ))}",
    "    </ul>",
    "  );",
    "}",
  ].join("\n");

  it("takes the first string of each row, though the line before the use says nothing of an icon", () => {
    expect(rowStarts(TABLE)).toEqual(['"bell"', '"anchor"']);
  });

  it("finds an icon in such a table that no other file names", () => {
    const root = mkdtempSync(join(tmpdir(), "fa-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/earned.tsx"), TABLE);
    const used = usedIcons(known, root);
    expect([...used.keys()].sort()).toEqual(["anchor", "bell"]);
    expect(used.get("bell")).toEqual(["src/earned.tsx"]);
  });

  it("does not take a query key or a word in a sentence", () => {
    expect(rowStarts('const k = ["indexer", "lag"] as const;\nconst s = "ticket to ride";')).toEqual([]);
  });
});
