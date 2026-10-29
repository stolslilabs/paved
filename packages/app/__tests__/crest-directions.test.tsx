import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MATERIAL_BASES } from "../src/components/elements/crest-art";
import { BASE_SHAPES, CrestDirectionArt, DIRECTIONS, directionParts, materialOf, RANKS } from "../src/components/elements/crest-directions";
import type { LeagueId } from "../src/lib/pvp-rules";

const IDS: readonly LeagueId[] = ["wood", "iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster"];
const LADDER = ["wood", "iron", "bronze", "silver", "gold"];

describe("the league crests' directions (#854, the second study)", () => {
  it("are three proposals, each named by one word", () => {
    expect(DIRECTIONS.map((d) => d.name)).toEqual(["Shield", "Helm", "Medal"]);
    expect(Object.keys(RANKS).sort()).toEqual([...IDS].sort());
  });

  it("draw one base shape for the nine groups in each direction, each group's crest its own", () => {
    for (const { id: direction } of DIRECTIONS) {
      const crests = IDS.map((id) => directionParts(direction, id));
      for (const [i, parts] of crests.entries()) expect(parts.some((p) => p.d === BASE_SHAPES[direction]), `${direction} ${IDS[i]}`).toBe(true);
      expect(new Set(crests.map((parts) => parts.map((p) => `${p.tone}${p.d}`).join("|"))).size, direction).toBe(IDS.length);
    }
  });

  it("climb in material, wood to gold, and never lose an ornament's worth of parts", () => {
    const ranks = IDS.map((id) => LADDER.indexOf(materialOf(id)));
    expect(ranks.every((r, i) => r >= 0 && (i === 0 || r >= ranks[i - 1]!))).toBe(true);
    expect([materialOf("wood"), materialOf("bronze"), materialOf("silver"), materialOf("gold"), materialOf("platinum")]).toEqual(LADDER);
    for (const { id: direction } of DIRECTIONS) {
      const counts = IDS.map((id) => directionParts(direction, id).length);
      expect(counts.every((n, i) => i === 0 || n >= counts[i - 1]!), `${direction}: ${counts.join(" ")}`).toBe(true);
    }
  });

  it("stay small: each crest's paths, its top division included, under 3 kB", () => {
    for (const { id: direction } of DIRECTIONS)
      for (const id of IDS) {
        const bytes = new Set(directionParts(direction, id, 1).map((p) => p.d)).values().reduce((n, d) => n + d.length, 0);
        expect(bytes, `${direction} ${id}`).toBeLessThan(3072);
      }
  });

  it("keep the divisions' studs on a plate of the group's material, none on Wood or Grand Master", () => {
    const plate = (id: LeagueId) => directionParts("shield", id, 2).at(-2)!;
    expect(plate("iron").tone).toBe("iron");
    expect(plate("gold").tone).toBe("silver");
    expect(directionParts("helm", "silver", 1).at(-1)!.d.match(/M/g)).toHaveLength(3);
    expect(directionParts("medal", "wood", 1)).toEqual(directionParts("medal", "wood"));
    expect(directionParts("medal", "grandmaster", 1)).toEqual(directionParts("medal", "grandmaster"));
  });

  it("draw as one SVG of tokens, named when given a label, its ids apart from another crest's", () => {
    const { container } = render(
      <>
        <CrestDirectionArt direction="helm" league="platinum" division={3} label="Platinum III league" />
        <CrestDirectionArt direction="helm" league="platinum" />
      </>,
    );
    const svg = screen.getByRole("img", { name: "Platinum III league" });
    expect(svg).toHaveAttribute("data-direction", "helm");
    expect(svg).toHaveAttribute("data-division", "3");
    const ids = [...container.querySelectorAll("linearGradient, mask")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg.innerHTML).toContain("var(--game-gold)");
    expect(svg.innerHTML).toContain("var(--league-platinum)");
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|oklch\(/i);
  });

  it("mix their materials from the game icons' tones, adding nothing to the stylesheet", () => {
    for (const [m, base] of Object.entries(MATERIAL_BASES)) {
      const tokens = base.match(/--[a-z-]+/g)!;
      expect(tokens.every((t) => t === "--background" || t.startsWith("--game-")), m).toBe(true);
    }
  });
});
