import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCrestShapes, CREST_SHAPE_NAMES, CREST_SHAPES_PATH } from "../scripts/league-crests";
import { CrestArt, crestParts, CRESTS, STUDS } from "../src/components/elements/crest-art";
import type { LeagueId } from "../src/lib/pvp-rules";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const IDS = Object.keys(CRESTS) as LeagueId[];

describe("the league crests (#854, the study)", () => {
  it("are what the owner's Font Awesome file gives (a stale shapes file fails here and in the build)", () => {
    expect(readFileSync(CREST_SHAPES_PATH, "utf8") === buildCrestShapes(), "Run `bun run league-crests` in packages/app and commit the file.").toBe(true);
  });

  it("draw one crest per group, each its own drawing, not one shape recoloured", () => {
    expect(IDS.sort()).toEqual(["bronze", "diamond", "gold", "grandmaster", "iron", "master", "platinum", "silver", "wood"]);
    // The motif: every part but the ground (the league-toned disc and its rim). No two groups share it.
    const motifs = IDS.map((id) => crestParts(id).filter((p) => p.tone !== "league").map((p) => `${p.t ?? ""}${p.d}`).join("|"));
    expect(new Set(motifs).size).toBe(IDS.length);
    for (const id of IDS) expect(crestParts(id).some((p) => p.tone === "league"), id).toBe(true);
  });

  it("stay small: each crest's paths, its top division included, under 3 kB", () => {
    for (const id of IDS) {
      const bytes = new Set(crestParts(id, 1).map((p) => p.d)).values().reduce((n, d) => n + d.length, 0);
      expect(bytes, id).toBeLessThan(3072);
    }
  });

  it("mark the divisions with one to three studs, III to I, and none on Wood or Grand Master", () => {
    expect([STUDS[3], STUDS[2], STUDS[1]]).toEqual([1, 2, 3]);
    const studs = (id: LeagueId, division?: 1 | 2 | 3) => crestParts(id, division).length - crestParts(id).length;
    expect(studs("silver", 3)).toBe(2);
    expect(crestParts("silver", 1).at(-1)!.d.match(/M/g)).toHaveLength(3);
    expect(crestParts("silver", 3).at(-1)!.d.match(/M/g)).toHaveLength(1);
    expect(studs("wood", 1)).toBe(0);
    expect(studs("grandmaster", 1)).toBe(0);
  });

  it("draw at the first paint as one SVG, named when given a label, its ids apart from another crest's", () => {
    expect(window.FontAwesome).toBeUndefined();
    const { container } = render(
      <>
        <CrestArt league="master" division={2} label="Master II league" />
        <CrestArt league="master" />
      </>,
    );
    const svg = screen.getByRole("img", { name: "Master II league" });
    expect(svg).toHaveAttribute("data-league", "master");
    expect(svg).toHaveAttribute("data-division", "2");
    expect(container.querySelectorAll("svg")[1]).toHaveAttribute("aria-hidden", "true");
    const ids = [...container.querySelectorAll("linearGradient, mask")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The ground in the group's own colour token, never a literal.
    expect(svg.innerHTML).toContain("var(--league-master)");
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|oklch\(/i);
  });

  it("are recorded in the notices as derived from Font Awesome Pro", () => {
    const notices = read("public/THIRD_PARTY_NOTICES.txt");
    const block = notices.slice(notices.indexOf("League crests (src/components/elements/league-crest-shapes.ts"));
    for (const name of [...CREST_SHAPE_NAMES, "swords"]) expect(block.slice(0, 900), name).toContain(`\`${name}\``);
  });
});
