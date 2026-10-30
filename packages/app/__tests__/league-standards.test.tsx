import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeagueBanner } from "../src/components/elements/league-banner";
import { MatchCard } from "../src/components/containers/match-list";
import { LeagueCrest } from "../src/components/elements/league-crest";
import { MOCK_NOW } from "../src/mocks/clock";
import { MATCHES, PVP_MATCHES } from "../src/mocks/pvp";
import { LeagueCrestArt, LeagueCrestIcon } from "../src/components/elements/league-crest-art";
import { LeaguePlate } from "../src/components/elements/league-plate";
import { LeagueStandard } from "../src/components/elements/league-standard";
import { bannerParts, crestParts, LEAGUE_TIERS, LOOKS, pipsOf, tierOf, TONES } from "../src/components/elements/league-standards";
import { LEAGUES } from "../src/lib/pvp-rules";

const IDS = LEAGUE_TIERS.map((t) => t.id);

describe("the leagues' standards (#917, PR 2: crests, plates, banners)", () => {
  it("has the ten tiers up the ladder, Unranked to Grand Master, Platinum renamed Emerald", () => {
    expect(LEAGUE_TIERS.map((t) => t.name)).toEqual(["Unranked", "Wood", "Iron", "Bronze", "Silver", "Gold", "Emerald", "Diamond", "Master", "Grand Master"]);
    expect(Object.keys(LOOKS).sort()).toEqual([...IDS].sort());
  });

  it("maps a league to its tier and its division to pips: none Unranked, III one, I three, none for Wood and Grand Master", () => {
    expect(tierOf(null)).toBe("unranked");
    expect(LEAGUES.map((l) => tierOf(l))).toEqual(["wood", ...LEAGUES.slice(1).map((l) => l.id)]);
    expect(LEAGUES.map(pipsOf)).toEqual([0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 0]);
  });

  it("gives each tier its own crest, its icon form with fewer parts, and its own banner", () => {
    const crests = IDS.map((t) => JSON.stringify(crestParts(t)));
    expect(new Set(crests).size).toBe(IDS.length);
    for (const t of IDS) expect(crestParts(t, "icon").length, t).toBeLessThan(crestParts(t, "full").length);
    expect(new Set(IDS.map((t) => JSON.stringify(bannerParts(t)))).size).toBe(IDS.length);
  });

  it("derives every tone from the game icons' tones: no raw colour in a drawing", () => {
    for (const tone of Object.values(TONES)) {
      expect(tone).toMatch(/var\(--game-/);
      expect(tone).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|oklch\(\s*\d/i);
    }
  });

  it("draws the crest, its icon with pips, the plate in font-display and the banner, each named or decorative", () => {
    const { container } = render(
      <>
        <LeagueCrestArt tier="emerald" label="Emerald league" />
        <LeagueCrestIcon tier="silver" pips={2} label="Silver II league" />
        <LeagueCrestIcon tier="silver" />
        <LeaguePlate tier="iron" name="Iron II" />
        <LeagueBanner tier="gold" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Emerald league" })).toHaveAttribute("data-slot", "league-crest-art");
    const icon = screen.getByRole("img", { name: "Silver II league" });
    expect(icon).toHaveAttribute("data-pips", "2");
    expect(icon.getAttribute("style")).toContain("1.5rem");
    const plate = screen.getByRole("img", { name: "Iron II" });
    expect(plate.querySelector("text")).toHaveClass("font-display");
    expect(plate.querySelector("text")).toHaveTextContent("Iron II");
    expect(plate.querySelector("text")).not.toHaveAttribute("textLength");
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(container.innerHTML).not.toMatch(/https?:|rgb\(/);
  });

  describe("fits the name to the plate's face by its rendered width, not its letters (jsdom has no layout: the width is stubbed)", () => {
    const proto = SVGElement.prototype as SVGElement & { getComputedTextLength?: () => number };
    const stub = (width: (text: string) => number) => {
      proto.getComputedTextLength = function (this: SVGElement) {
        return this.hasAttribute("textLength") ? 404 : width(this.textContent ?? "");
      };
    };
    afterEach(() => {
      delete proto.getComputedTextLength;
    });
    const textOf = (name: string) => screen.getByRole("img", { name }).querySelector("text")!;

    it("squeezes a short name of wide letters that passes the face", () => {
      stub(() => 641);
      render(<LeaguePlate tier="iron" name="WWWWWWWWWWWWW" />);
      expect(textOf("WWWWWWWWWWWWW")).toHaveAttribute("textLength", "404");
      expect(textOf("WWWWWWWWWWWWW")).toHaveAttribute("lengthAdjust", "spacingAndGlyphs");
    });

    it("leaves a long name of narrow letters that fits as set", () => {
      stub(() => 300);
      render(<LeaguePlate tier="iron" name="iiiiiiiiiiiiiiiiiiiiii" />);
      expect(textOf("iiiiiiiiiiiiiiiiiiiiii")).not.toHaveAttribute("textLength");
    });

    it("measures again for a new name, dropping a squeeze it no longer needs", () => {
      stub((text) => (text.startsWith("W") ? 641 : 200));
      const { rerender } = render(<LeaguePlate tier="iron" name="WWWWWWWWWWWWW" />);
      expect(textOf("WWWWWWWWWWWWW")).toHaveAttribute("textLength", "404");
      rerender(<LeaguePlate tier="iron" name="Iron II" />);
      expect(textOf("Iron II")).not.toHaveAttribute("textLength");
    });
  });

  it("stacks the standard: the crest over the plate over the banner, named by its plate", () => {
    const { container } = render(<LeagueStandard tier="grandmaster" name="Grand Master" />);
    const slots = [...container.querySelectorAll("svg")].map((s) => s.dataset.slot);
    expect(slots).toEqual(["league-crest-art", "league-plate", "league-banner"]);
    expect(screen.getAllByRole("img").map((i) => i.getAttribute("aria-label"))).toEqual(["Grand Master"]);
    expect(container.firstElementChild).toHaveAttribute("data-tier", "grandmaster");
  });

  it("the standard's plate can be the heading that names it (the League page's card)", () => {
    render(<LeagueStandard tier="emerald" name="Emerald III" heading="h2" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName("Emerald III");
  });
});

describe("the leagues' standards in the app (#917, PR 3)", () => {
  it("LeagueCrest draws the tier's icon form with the division's pips beside the name", () => {
    const { container, rerender } = render(<LeagueCrest league={LEAGUES[14]!} />);
    const icon = () => container.querySelector("[data-slot=league-crest-icon]")!;
    expect(container.firstElementChild).toHaveTextContent("Emerald II");
    expect(icon()).toHaveAttribute("data-tier", "emerald");
    expect(icon()).toHaveAttribute("data-pips", "2");
    // The crest alone is named by the league.
    rerender(<LeagueCrest league={LEAGUES[22]!} iconOnly />);
    expect(screen.getByRole("img", { name: "Grand Master league" })).toHaveAttribute("data-tier", "grandmaster");
    expect(icon()).not.toHaveAttribute("data-pips");
  });

  it("LeagueCrest reads Unranked outside the leagues, whatever the league", () => {
    const { container, rerender } = render(<LeagueCrest league={LEAGUES[0]!} unranked />);
    expect(container.firstElementChild).toHaveTextContent(/^Unranked$/);
    expect(container.querySelector("[data-slot=league-crest-icon]")).toHaveAttribute("data-tier", "unranked");
    rerender(<LeagueCrest league={LEAGUES[0]!} unranked iconOnly />);
    expect(screen.getByRole("img", { name: "Unranked" })).toBeInTheDocument();
  });

  it("the battle logs' card shows the rival's league crest where known, none on v1's rows", () => {
    const match = MATCHES[0]!;
    const { container, rerender } = render(<MatchCard match={match} now={MOCK_NOW} />);
    const crest = () => container.querySelector("[data-slot=league-crest-icon]");
    expect(crest()).toHaveAttribute("data-tier", match.league!.id);
    rerender(<MatchCard match={PVP_MATCHES.noSnapshot.matches[0]!} now={MOCK_NOW} />);
    expect(crest()).toBeNull();
  });
});
