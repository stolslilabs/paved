import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MATERIAL_BASES } from "../src/components/elements/crest-art";
import { SHIELD_RANKS, SHIELD_TOPS, ShieldCrest, shieldParts } from "../src/components/elements/crest-shield";
import type { LeagueId } from "../src/lib/pvp-rules";

const IDS: readonly LeagueId[] = ["wood", "iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster"];
const TOPS = ["plain", "crenellated", "crowned"];

describe("the league crests' shield and swords (#854, the third study)", () => {
  it("draw a shield for every league, and the owner's swords: none, none, one, two, then three", () => {
    expect(Object.keys(SHIELD_RANKS).sort()).toEqual([...IDS].sort());
    expect(IDS.map((id) => SHIELD_RANKS[id].swords)).toEqual([0, 0, 1, 2, 3, 3, 3, 3, 3]);
    for (const id of IDS) expect(shieldParts(id).some((p) => p.d === SHIELD_TOPS[SHIELD_RANKS[id].top]), id).toBe(true);
  });

  it("give each league its own crest, its shapes never simpler than the league's below", () => {
    const crests = IDS.map((id) => shieldParts(id).map((p) => `${p.tone}${p.d}`).join("|"));
    expect(new Set(crests).size).toBe(IDS.length);
    const tops = IDS.map((id) => TOPS.indexOf(SHIELD_RANKS[id].top));
    expect(tops.every((t, i) => i === 0 || t >= tops[i - 1]!)).toBe(true);
    expect([SHIELD_RANKS.gold.top, SHIELD_RANKS.platinum.top, SHIELD_RANKS.grandmaster.top]).toEqual(TOPS);
    expect(IDS.slice(6).every((id) => SHIELD_RANKS[id].gem)).toBe(true);
  });

  it("stay small: each crest's paths under 3 kB", () => {
    for (const id of IDS) {
      const bytes = new Set(shieldParts(id).map((p) => p.d)).values().reduce((n, d) => n + d.length, 0);
      expect(bytes, id).toBeLessThan(3072);
    }
  });

  it("draw as one SVG of tokens in the flat finish, named when given a label, its ids apart from another crest's", () => {
    const { container } = render(
      <>
        <ShieldCrest league="master" label="Master league" />
        <ShieldCrest league="master" />
      </>,
    );
    const svg = screen.getByRole("img", { name: "Master league" });
    expect(svg).toHaveAttribute("data-slot", "shield-crest");
    expect(svg).toHaveAttribute("data-league", "master");
    expect(container.querySelectorAll("linearGradient")).toHaveLength(0);
    const ids = [...container.querySelectorAll("mask")].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg.innerHTML).toContain("var(--game-gold)");
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|oklch\(/i);
  });

  it("mix their materials from the game icons' tones, adding nothing to the stylesheet", () => {
    for (const [m, base] of Object.entries(MATERIAL_BASES)) {
      const tokens = base.match(/--[a-z-]+/g)!;
      expect(tokens.every((t) => t.startsWith("--game-")), m).toBe(true);
    }
  });
});
