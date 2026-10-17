import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TEXT-12 (P-69): no text under 12 px. Page zoom is off, so the text size is the only help a reader has: nothing in
 * `src` sets a font size below 12 px. Enforced on the source:
 *
 * - an arbitrary Tailwind size `text-[Npx]` or `text-[Nrem]` / `text-[Nem]` (also `text-[length:...]`) under 12 px
 *   (1 rem = 16 px);
 * - a `font-size` in a stylesheet, or a `fontSize` in a style object, under 12 px.
 *
 * Icon sizes (`ui/icon.tsx`: 0.75 rem and up) are 12 px or more and pass.
 */

const ROOT = join(import.meta.dirname, "..");
const MIN_PX = 12;

export interface Finding {
  file: string;
  line: number;
  text: string;
}

const UNIT_PX: Record<string, number> = { px: 1, rem: 16, em: 16 };
const SIZE = String.raw`(\d*\.?\d+)(px|rem|em)`;

/** The font sizes under 12 px set in one source file. */
export function smallText(file: string, src: string): Finding[] {
  const out: Finding[] = [];
  const patterns = [
    new RegExp(String.raw`\btext-\[(?:length:)?${SIZE}\]`, "g"),
    new RegExp(String.raw`\bfont-size\s*:\s*${SIZE}`, "g"),
    new RegExp(String.raw`\bfontSize\s*:\s*["'\x60]?${SIZE}`, "g"),
    new RegExp(String.raw`\bfontSize\s*:\s*(\d*\.?\d+)\b(?!\s*(?:px|rem|em))`, "g"),
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const px = Number(m[1]) * (UNIT_PX[m[2] ?? "px"] ?? 1);
      if (px < MIN_PX) out.push({ file, line: src.slice(0, m.index).split("\n").length, text: m[0] });
    }
  }
  return out;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });
}

describe("text size guard (TEXT-12)", () => {
  it("flags every size under 12 px in a fixture", () => {
    const fixture = [
      '<p className="text-[11px]">a</p>',
      '<p className="text-[10px] text-[0.6rem] text-[length:9px]">b</p>',
      "a { font-size: 11px; }",
      "const s = { fontSize: 10 };",
      'const t = { fontSize: "0.7rem" };',
    ].join("\n");
    expect(smallText("fixture.tsx", fixture).map((f) => f.text)).toEqual(
      expect.arrayContaining(["text-[11px]", "text-[10px]", "text-[0.6rem]", "text-[length:9px]", "font-size: 11px", "fontSize: 10", 'fontSize: "0.7rem']),
    );
  });

  it("passes 12 px and above", () => {
    const fixture = '<p className="text-xs text-[12px] text-[0.75rem] text-[1rem]">ok</p>\na { font-size: 12px; font-size: 1rem }\nconst s = { fontSize: 14 };';
    expect(smallText("fixture.tsx", fixture)).toEqual([]);
  });

  it("finds no text under 12 px in src", () => {
    const src = join(ROOT, "src");
    const found = files(src).flatMap((f) => smallText(relative(ROOT, f), readFileSync(f, "utf8")));
    expect(found).toEqual([]);
  });
});
