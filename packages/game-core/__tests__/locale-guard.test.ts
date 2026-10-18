import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanDirs, scanSource } from "./locale-guard-scan";

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixture = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");

/**
 * P-66: no number or date is formatted by the user's locale. Every call goes through `packages/game-core/src/format.ts`.
 * The overlays of `packages/ui` are scanned too.
 */
describe("locale guard (P-66)", () => {
  it("fails on a fixture of bare calls: every line is found", () => {
    const found = scanSource("fixtures/bare-locale-calls.fixture.txt", fixture("bare-locale-calls.fixture.txt"));
    expect(found.map((v) => v.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("passes on a fixture that uses the formatter, with the rules quoted in comments and strings", () => {
    expect(scanSource("fixtures/clean.fixture.txt", fixture("clean.fixture.txt"))).toEqual([]);
  });

  it("finds no locale-dependent call outside the formatter module", () => {
    const found = scanDirs(
      PACKAGES,
      ["app/src", "ui/src", "renderer/src", "chain/src", "game-core/src"],
      ["game-core/src/format.ts"],
    );
    expect(found.map((v) => `${v.file}:${v.line} ${v.text}`)).toEqual([]);
  });
});
