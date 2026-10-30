import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MATERIAL_BASES, type CrestArtSize } from "../src/components/elements/crest-art";
import { SHIELD_RANKS, SHIELD_TOPS, ShieldCrest, shieldModel, type ShieldModel } from "../src/components/elements/crest-shield";
import type { LeagueId } from "../src/lib/pvp-rules";

const IDS: readonly LeagueId[] = ["wood", "iron", "bronze", "silver", "gold", "emerald", "diamond", "master", "grandmaster"];
const TOPS = ["plain", "crenellated", "crowned"];
/** The client's sizes: 24, 40 and 96 px. */
const SIZES: readonly CrestArtSize[] = ["md", "lg", "2xl"];
const swords = (m: ShieldModel) => m.behind.length + m.before.length;

describe("the league crests' shield and swords (#854, the third study)", () => {
  it("draw a shield for every league, and the owner's swords: none, none, one, two, then three", () => {
    expect(Object.keys(SHIELD_RANKS).sort()).toEqual([...IDS].sort());
    expect(IDS.map((id) => swords(shieldModel(id)))).toEqual([0, 0, 1, 2, 3, 3, 3, 3, 3]);
    expect(shieldModel("bronze").before).toHaveLength(1);
    expect(shieldModel("silver").behind).toHaveLength(2);
    for (const id of IDS) expect(shieldModel(id).shield[0]!.d, id).toBe(SHIELD_TOPS[SHIELD_RANKS[id].top]);
  });

  it("give each league its own crest, its shapes never simpler than the league's below", () => {
    const crests = IDS.map((id) => JSON.stringify(shieldModel(id)));
    expect(new Set(crests).size).toBe(IDS.length);
    const tops = IDS.map((id) => TOPS.indexOf(SHIELD_RANKS[id].top));
    expect(tops.every((t, i) => i === 0 || t >= tops[i - 1]!)).toBe(true);
    expect([SHIELD_RANKS.gold.top, SHIELD_RANKS.emerald.top, SHIELD_RANKS.grandmaster.top]).toEqual(TOPS);
    expect(IDS.slice(6).every((id) => SHIELD_RANKS[id].gem)).toBe(true);
  });

  it("stay small: each crest's whole SVG, as the page holds it, under 3 kB at 24, 40 and 96 px", () => {
    const { container } = render(
      <>
        {SIZES.flatMap((size) => IDS.map((id) => <ShieldCrest key={`${size}${id}`} league={id} size={size} label="Grand Master league" />))}
      </>,
    );
    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs).toHaveLength(SIZES.length * IDS.length);
    for (const svg of svgs) expect(new TextEncoder().encode(svg.outerHTML).length, svg.dataset.league).toBeLessThan(3072);
  });

  it("draw the hilt once and each sword's from it, the shadow from the crest itself, ids apart from another crest's", () => {
    const { container } = render(
      <>
        <ShieldCrest league="master" label="Master league" />
        <ShieldCrest league="master" />
      </>,
    );
    const svg = screen.getByRole("img", { name: "Master league" });
    expect(svg).toHaveAttribute("data-slot", "shield-crest");
    expect(svg).toHaveAttribute("data-league", "master");
    const [hilt, crest] = [svg.querySelector("defs > g")!, svg.querySelector(":scope > g")!];
    expect([...svg.querySelectorAll("use")].map((u) => u.getAttribute("href"))).toEqual([`#${crest.id}`, `#${hilt.id}`, `#${hilt.id}`, `#${hilt.id}`]);
    const ids = [...container.querySelectorAll("[id]")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg.style.getPropertyValue("--m")).toBe("var(--game-gold)");
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|oklch\(/i);
  });

  it("draw Wood and Iron without swords, so without a hilt", () => {
    render(<ShieldCrest league="iron" label="Iron league" />);
    const svg = screen.getByRole("img", { name: "Iron league" });
    expect(svg.querySelector("defs")).toBeNull();
    expect(svg.querySelectorAll("use")).toHaveLength(1);
  });

  it("mix their materials from the game icons' tones, adding nothing to the stylesheet", () => {
    for (const [m, base] of Object.entries(MATERIAL_BASES)) {
      const tokens = base.match(/--[a-z-]+/g)!;
      expect(tokens.every((t) => t.startsWith("--game-")), m).toBe(true);
    }
  });
});
