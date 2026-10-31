import { statSync } from "node:fs";
import { join } from "node:path";
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
import { artName, artSources, artUrl, divisionOf, LEAGUE_ART, LEAGUE_TIERS, PLATE_FACE, tierOf, versionsOf } from "../src/components/elements/league-standards";
import { LEAGUES } from "../src/lib/pvp-rules";
import { expected, masters, OUT, problems } from "../scripts/compress-league-art.ts";

describe("the leagues' standards (#917, PR 2: crests, plates, banners)", () => {
  it("has the ten tiers up the ladder, Unranked to Grand Master, Platinum renamed Emerald", () => {
    expect(LEAGUE_TIERS.map((t) => t.name)).toEqual(["Unranked", "Wood", "Iron", "Bronze", "Silver", "Gold", "Emerald", "Diamond", "Master", "Grand Master"]);
  });

  it("maps a league to its tier and its division to a numeral: none Unranked, III, II, I up a group, none for Wood and Grand Master", () => {
    expect(tierOf(null)).toBe("unranked");
    expect(LEAGUES.map((l) => tierOf(l))).toEqual(["wood", ...LEAGUES.slice(1).map((l) => l.id)]);
    expect(LEAGUES.map(divisionOf)).toEqual([null, ...Array.from({ length: 7 }, () => ["III", "II", "I"]).flat(), null]);
  });

  it("ships each part of each tier as a WebP of its size, from a master on the part's frame (scripts/compress-league-art.ts)", () => {
    // The crest and the icon in four versions (plain, I, II, III), the plate and the banner in one.
    expect(masters()).toHaveLength((4 + 4 + 1 + 1) * LEAGUE_TIERS.length);
    expect(versionsOf("crest")).toEqual([null, "I", "II", "III"]);
    expect(versionsOf("banner")).toEqual([null]);
    expect(problems()).toEqual([]);
    // Small: about 39 KiB a crest at 512 px, 2.4 KiB an icon at 64 px (measured 3.3 MiB for the 200 copies; a page loads a few).
    const total = expected().reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);
    expect(total).toBeLessThan(4 * 1024 * 1024);
  });

  it("points each image at its tier's copies, the smallest that stays sharp for the size shown, in its division's version", () => {
    const crest = artSources("crest", "gold", 96);
    expect(crest.src).toBe("/league-art/crest/512/gold.webp");
    expect(crest.srcSet).toBe("/league-art/crest/256/gold.webp 256w, /league-art/crest/512/gold.webp 512w");
    expect(crest.sizes).toBe("96px");
    expect(artSources("crest", "bronze", 96, "II").src).toBe("/league-art/crest/512/bronze-ii.webp");
    expect(artSources("icon", "emerald", 24, "III").srcSet).toBe("/league-art/icon/64/emerald-iii.webp 64w, /league-art/icon/128/emerald-iii.webp 128w");
    // A part drawn without divisions gives its plain version.
    expect(artUrl("banner", "silver", 256, "I")).toBe("/league-art/banner/256/silver.webp");
    expect(artName("grandmaster")).toBe("grandmaster");
    expect(artSources("plate", "iron").srcSet).toBe("/league-art/plate/256/iron.webp 256w, /league-art/plate/512/iron.webp 512w");
    expect(artSources("banner", "master").srcSet).toBe("/league-art/banner/256/master.webp 256w, /league-art/banner/512/master.webp 512w");
    expect(artSources("icon", "wood").sizes).toBe("128px");
  });

  it("draws the crest, its icon with its numeral, the plate in font-display and the banner, each named or decorative", () => {
    const { container } = render(
      <>
        <LeagueCrestArt tier="emerald" label="Emerald league" />
        <LeagueCrestIcon tier="silver" division="II" label="Silver II league" />
        <LeagueCrestIcon tier="silver" />
        <LeaguePlate tier="iron" name="Iron II" />
        <LeagueBanner tier="gold" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Emerald league" })).toHaveAttribute("data-slot", "league-crest-art");
    const icon = screen.getByRole("img", { name: "Silver II league" });
    expect(icon).toHaveAttribute("data-division", "II");
    expect(icon.getAttribute("style")).toContain("1.5rem");
    const plate = screen.getByRole("img", { name: "Iron II" });
    expect(plate.querySelector("text")).toHaveClass("font-display");
    expect(plate.querySelector("text")).toHaveTextContent("Iron II");
    expect(plate.querySelector("text")).not.toHaveAttribute("textLength");
    // The division: the icon's version with its numeral drawn into the art (no text); the bare icon its plain version.
    expect(icon.querySelector("img")!.getAttribute("src")).toBe("/league-art/icon/128/silver-ii.webp");
    expect(container.querySelector('[data-slot="league-crest-icon"]:not([data-division]) img')!.getAttribute("src")).toBe("/league-art/icon/128/silver.webp");
    expect(icon).not.toHaveTextContent(/./);
    // Decorative: both icons' images, the plate's and the banner's; the bare icon hidden whole.
    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-slot="league-crest-icon"][aria-hidden="true"]')).toHaveLength(1);
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("src")).toMatch(/^\/league-art\/(crest|icon|plate|banner)\/\d+\/[a-z]+(-i{1,3})?\.webp$/);
      expect(img).toHaveAttribute("draggable", "false");
    }
    expect(container.innerHTML).not.toMatch(/https?:|rgb\(/);
  });

  describe("fits the name to the plate's face by its rendered width, not its letters (jsdom has no layout: the width is stubbed)", () => {
    const proto = SVGElement.prototype as SVGElement & { getComputedTextLength?: () => number };
    const INNER = String(LEAGUE_ART.plate.width * PLATE_FACE);
    const stub = (width: (text: string) => number) => {
      proto.getComputedTextLength = function (this: SVGElement) {
        return this.hasAttribute("textLength") ? Number(INNER) : width(this.textContent ?? "");
      };
    };
    afterEach(() => {
      delete proto.getComputedTextLength;
    });
    const textOf = (name: string) => screen.getByRole("img", { name }).querySelector("text")!;

    it("squeezes a short name of wide letters that passes the face", () => {
      stub(() => 641);
      render(<LeaguePlate tier="iron" name="WWWWWWWWWWWWW" />);
      expect(textOf("WWWWWWWWWWWWW")).toHaveAttribute("textLength", INNER);
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
      expect(textOf("WWWWWWWWWWWWW")).toHaveAttribute("textLength", INNER);
      rerender(<LeaguePlate tier="iron" name="Iron II" />);
      expect(textOf("Iron II")).not.toHaveAttribute("textLength");
    });
  });

  it("stacks the standard: the crest over the plate over the banner, named by its plate", () => {
    const { container } = render(<LeagueStandard tier="grandmaster" name="Grand Master" />);
    const slots = [...container.querySelectorAll<HTMLElement>("[data-slot]")].map((s) => s.dataset.slot);
    expect(slots).toEqual(["league-standard", "league-crest-art", "league-plate", "league-banner"]);
    expect(screen.getAllByRole("img").map((i) => i.getAttribute("aria-label"))).toEqual(["Grand Master"]);
    expect(container.firstElementChild).toHaveAttribute("data-tier", "grandmaster");
  });

  it("the standard's plate can be the heading that names it (the League page's card)", () => {
    render(<LeagueStandard tier="emerald" name="Emerald III" heading="h2" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveAccessibleName("Emerald III");
  });
});

describe("the leagues' standards in the app (#917, PR 3)", () => {
  it("LeagueCrest draws the tier's icon form with the division's numeral beside the name", () => {
    const { container, rerender } = render(<LeagueCrest league={LEAGUES[14]!} />);
    const icon = () => container.querySelector("[data-slot=league-crest-icon]")!;
    expect(container.firstElementChild).toHaveTextContent("Emerald II");
    expect(icon()).toHaveAttribute("data-tier", "emerald");
    expect(icon()).toHaveAttribute("data-division", "II");
    // The crest alone is named by the league.
    rerender(<LeagueCrest league={LEAGUES[22]!} iconOnly />);
    expect(screen.getByRole("img", { name: "Grand Master league" })).toHaveAttribute("data-tier", "grandmaster");
    expect(icon()).not.toHaveAttribute("data-division");
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
