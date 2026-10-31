import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAGUES } from "../src/lib/pvp-rules";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { dotsWindow } from "../src/components/ui/carousel-dots";
import { crownRange } from "../src/components/containers/league-card";
import { LEAGUE_SLIDES } from "../src/components/containers/league-carousel";
import { PVP_LEAGUE } from "../src/mocks/pvp";

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
const carousel = () => screen.getByRole("region", { name: "Leagues" });
/** The slide in view: the others are out of the accessibility tree. */
const inView = () => within(carousel()).getByRole("group");
const dots = () => within(screen.getByRole("group", { name: "Go to a league" })).getAllByRole("button");
const current = () => dots().find((d) => d.getAttribute("aria-current") === "true");
const control = () => screen.getByRole("button", { name: /^Your league: .*\. Show it$/ });

afterEach(cleanup);

describe("League carousel (#785, #833, #859)", () => {
  it("opens on the player's league; the card alone, no crowns' count; the dots in place of the position; no Attack, no back icon", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    expect(inView()).toHaveAccessibleName("Bronze II");
    expect(inView()).toHaveAttribute("aria-current", "true");
    // Unranked's slide, then the 23 leagues (#917).
    expect(carousel().querySelectorAll("[data-slot='carousel-item']")).toHaveLength(LEAGUES.length + 1);
    // Under the title: the range of crowns and the season's Cobbles.
    expect(within(inView()).getByRole("img", { name: "1,000 to 1,199 crowns" })).toBeInTheDocument();
    expect(within(inView()).getByRole("img", { name: "+20 Cobbles" })).toBeInTheDocument();
    // No crowns' count in the card (#859): no way to the next league, no crowns to go.
    expect(within(carousel()).queryByRole("progressbar")).toBeNull();
    expect(within(carousel()).queryByText(/crowns to go|Reached/)).toBeNull();
    // The card stands alone on the page, with no ground of its own (2026-10-30): the arrows and the dots outside it, no box around them.
    const card = within(inView()).getByText("Bronze II").closest<HTMLElement>("[data-slot=league-card]")!;
    expect(card.className).not.toMatch(/\bborder\b|\bbg-card\b/);
    for (const name of ["Previous league", "Next league", "Go to Bronze II"]) expect(card).not.toContainElement(screen.getByRole("button", { name }));
    expect(carousel().parentElement!.parentElement!.className).not.toMatch(/\bborder\b|\bbg-card\b/);
    // One dot per slide, Unranked's included, the current one marked; no "N of 23".
    expect(dots()).toHaveLength(LEAGUE_SLIDES.length);
    expect(dots()[0]).toHaveAccessibleName("Go to Unranked");
    expect(current()).toHaveAccessibleName("Go to Bronze II");
    expect(screen.queryByText(/of 23/)).toBeNull();
    expect(screen.queryByTestId("league-position")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Attack/ })).toBeNull();
    // The player's crowns are the header's (#859), no longer under the carousel.
    expect(screen.queryByTestId("league-player")).toBeNull();
    expect(screen.queryByText(/Your crowns|Season best/)).toBeNull();
    expect(control()).toHaveAccessibleName("Your league: Bronze II, 1,172 crowns. Show it");
    // The list of the latest matches is the page's own (#786); no other list.
    expect(screen.queryAllByRole("list").map((l) => l.getAttribute("aria-label"))).toEqual(["Matches"]);
  });

  it("every league's card has the same content rows: the crest, the range, the season reward, the plate (the title)", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    const cards = carousel().querySelectorAll<HTMLElement>("[data-slot='league-card']");
    expect(cards).toHaveLength(LEAGUE_SLIDES.length);
    // One height for all, Wood included: every crest has one box, at one size (#917).
    const crests = [...cards].map((c) => c.querySelector<HTMLElement>(":scope > [data-slot=league-crest-art]")!);
    expect(new Set(crests.map((f) => f.style.fontSize))).toEqual(new Set(["10rem"]));
    expect(crests.map((f) => f.dataset.tier)).toEqual(["unranked", ...LEAGUES.map((l) => l.id)]);
    // The plate names the card: its heading, the last row.
    expect(cards[0]!.querySelector("h2")).toHaveAccessibleName("Unranked");
    expect(cards[14]!.querySelector("h2")).toHaveAccessibleName("Emerald III");
    for (const card of cards) expect(card.lastElementChild!.tagName).toBe("H2");
    // The four rows, no bonus's corner since #917 (a lifetime league mission instead).
    for (const card of cards) expect(card.children).toHaveLength(4);
    expect(carousel().querySelector("[data-bonus]")).toBeNull();
    expect(crownRange(LEAGUES[0]!).text).toBe("0 – 399");
    expect(crownRange(LEAGUES[22]!).text).toBe("5,000+");
  });

  for (const reduced of ["never", "always"] as const) {
    it(`the arrows, the keys and the dots move through the leagues (reduced motion ${reduced})`, async () => {
      render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />, reduced));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Next league" }));
      expect(inView()).toHaveAccessibleName("Bronze I");
      expect(inView()).not.toHaveAttribute("aria-current");
      expect(current()).toHaveAccessibleName("Go to Bronze I");

      await user.click(screen.getByRole("button", { name: "Previous league" }));
      await user.click(screen.getByRole("button", { name: "Previous league" }));
      expect(inView()).toHaveAccessibleName("Bronze III");

      carousel().focus();
      await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
      expect(inView()).toHaveAccessibleName("Silver III");
      await user.keyboard("{ArrowLeft}");
      expect(inView()).toHaveAccessibleName("Bronze I");

      await user.click(screen.getByRole("button", { name: "Go to Gold II" }));
      expect(inView()).toHaveAccessibleName("Gold II");
      expect(current()).toHaveAccessibleName("Go to Gold II");
    });
  }

  for (const reduced of ["never", "always"] as const) {
    it(`the header's League control brings the carousel back to the player's league, the card's back icon gone (reduced motion ${reduced})`, async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        render(wrap(<PvpLeagueScene {...PVP_LEAGUE.higher} />, reduced));
        expect(inView()).toHaveAccessibleName("Silver II");
        expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
        // In the header, in the balances' place: no balance there.
        const header = screen.getByRole("heading", { level: 1, name: "League" }).closest("header")!;
        expect(header).toContainElement(control());
        expect(within(header).queryAllByRole("region", { name: "Balances" })).toEqual([]);
        await userEvent.click(control());
        expect(inView()).toHaveAccessibleName("Bronze II");
        expect(current()).toHaveAccessibleName("Go to Bronze II");
        // The carousel comes into view, gliding, or at once under reduced motion; no navigation.
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: reduced === "always" ? "instant" : "smooth" });
        // It stops under the sticky header, never beneath it (jsdom lays nothing out: the margin is the style; the stories measure it).
        expect((scrollIntoView.mock.contexts[0] as HTMLElement).style.scrollMarginTop).toBe("calc(var(--header-h) + env(safe-area-inset-top) + 1rem)");
        // On the player's league already, a tap keeps it there.
        await userEvent.click(control());
        expect(inView()).toHaveAccessibleName("Bronze II");
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });
  }

  it("stops at Unranked, before Wood, and at Grand Master", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.unranked} />));
    // Outside the leagues (no crown, no attack): the header reads Unranked (#917), and the carousel opens on Unranked's card, the
    // player's, before Wood's: no range of crowns there, Wood's starts at 0.
    expect(control()).toHaveAccessibleName("Your league: Unranked, 0 crowns. Show it");
    expect(control()).toHaveAttribute("data-tier", "unranked");
    expect(inView()).toHaveAccessibleName("Unranked");
    expect(inView()).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { name: "Unranked" })).toBeInTheDocument();
    expect(within(inView()).queryByRole("img", { name: /crowns/ })).toBeNull();
    expect(within(inView()).getByText("Before the first attack")).toBeInTheDocument();
    expect(within(inView()).getByText("No season reward")).toBeInTheDocument();
    expect(inView().querySelector<HTMLElement>("[data-slot=league-crest-art]")!.dataset.tier).toBe("unranked");
    expect(current()).toHaveAccessibleName("Go to Unranked");
    expect(screen.getByRole("button", { name: "Previous league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(inView()).toHaveAccessibleName("Unranked");
    await userEvent.keyboard("{ArrowRight}");
    expect(inView()).toHaveAccessibleName("Wood");
    expect(within(inView()).getByRole("img", { name: "0 to 399 crowns" })).toBeInTheDocument();
    cleanup();

    // In Wood after a first attack: the carousel opens on Wood, the player's; Unranked's card is before it.
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.wood} />));
    expect(inView()).toHaveAccessibleName("Wood");
    expect(inView()).toHaveAttribute("aria-current", "true");
    expect(control()).toHaveAccessibleName("Your league: Wood, 120 crowns. Show it");
    await userEvent.click(screen.getByRole("button", { name: "Previous league" }));
    expect(inView()).toHaveAccessibleName("Unranked");
    expect(inView()).not.toHaveAttribute("aria-current");
    cleanup();

    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.grandmaster} />));
    expect(inView()).toHaveAccessibleName("Grand Master");
    expect(current()).toHaveAccessibleName("Go to Grand Master");
    expect(within(inView()).getByRole("img", { name: "5,000 crowns and more" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(inView()).toHaveAccessibleName("Grand Master");
    await userEvent.click(screen.getByRole("button", { name: "Previous league" }));
    expect(inView()).toHaveAccessibleName("Master I");
  });

  it("the dots' window holds inside the row (open point 2)", () => {
    expect(dotsWindow(23, 0, 23)).toBe(0);
    expect(dotsWindow(23, 0, 9)).toBe(0);
    expect(dotsWindow(23, 11, 9)).toBe(7);
    expect(dotsWindow(23, 22, 9)).toBe(14);
  });
});
