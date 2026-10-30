import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BADGES, BadgeCrest } from "../src/components/elements/crest-badge";
import type { LeagueId } from "../src/lib/pvp-rules";

const IDS: readonly LeagueId[] = ["wood", "iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster"];
/** A badge's outer silhouette: its body's rim, the layer just under the bevelled field. */
const silhouette = (id: LeagueId) => BADGES[id].layers[BADGES[id].layers.findIndex((l) => l.bevel) - 1]!.d;

describe("the league badges (#854, the fourth study)", () => {
  it("draw nine badges, the body's shape changing at every step up to Master", () => {
    expect(Object.keys(BADGES).sort()).toEqual([...IDS].sort());
    const shapes = IDS.map(silhouette);
    for (let i = 1; i < IDS.length - 1; i++) expect(shapes[i], IDS[i]).not.toBe(shapes[i - 1]);
    // Grand Master keeps Master's shield and changes its outline: a burst behind it, wider wings, a taller crown.
    expect(BADGES.grandmaster.layers[0]!.d).not.toBe(BADGES.master.layers[0]!.d);
    expect(new Set(IDS.map((id) => JSON.stringify(BADGES[id]))).size).toBe(IDS.length);
  });

  it("grow richer up the ladder: bare bodies to Bronze, then never fewer ornaments than the league below, Grand Master the most", () => {
    const counts = IDS.map((id) => BADGES[id].ornaments.length);
    expect(counts).toEqual([0, 0, 0, 1, 2, 2, 2, 3, 4]);
    expect(BADGES.grandmaster.ornaments).toEqual(expect.arrayContaining(BADGES.master.ornaments));
  });

  it("draw each badge once and use it for the shadow, the outline and the colours, its ids apart from another badge's", () => {
    const { container } = render(
      <>
        <BadgeCrest league="master" label="Master league" />
        <BadgeCrest league="master" size="2xl" />
      </>,
    );
    const svg = screen.getByRole("img", { name: "Master league" });
    expect(svg).toHaveAttribute("data-slot", "badge-crest");
    expect(svg).toHaveAttribute("data-league", "master");
    const badge = svg.querySelector("defs > g")!;
    expect([...svg.querySelectorAll(":scope > use")].map((u) => u.getAttribute("href"))).toEqual(Array(3).fill(`#${badge.id}`));
    const ids = [...container.querySelectorAll("[id]")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(container.querySelectorAll("svg")[1]).toHaveAttribute("aria-hidden", "true");
  });

  it("paint with the game icons' tones only: no raw colour in the markup", () => {
    const { container } = render(
      <>
        {IDS.map((id) => (
          <BadgeCrest key={id} league={id} />
        ))}
      </>,
    );
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.outerHTML, svg.dataset.league).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(/i);
      for (const v of svg.outerHTML.match(/var\(--[a-z-]+/g) ?? []) expect(v, svg.dataset.league).toMatch(/^var\(--(game-[a-z]+|s|w|e[a-z]+)$/);
    }
  });
});
