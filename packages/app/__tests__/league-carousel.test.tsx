import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAGUES } from "../src/lib/pvp-rules";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { dotsWindow } from "../src/components/ui/carousel-dots";
import { crownRange } from "../src/components/containers/league-card";
import { PVP_LEAGUE } from "../src/mocks/pvp";

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
const carousel = () => screen.getByRole("region", { name: "Leagues" });
/** The slide in view: the others are out of the accessibility tree. */
const inView = () => within(carousel()).getByRole("group");
const control = () => screen.getByRole("button", { name: /^Your league: .*\. Show it$/ });

afterEach(cleanup);

describe("League carousel (#785, #833, #859)", () => {
  it("opens on the player's league; the card alone, no crowns' count, no season reward; no dots (LEAGUE-PAGE); no Attack, no back icon", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    expect(inView()).toHaveAccessibleName("Bronze II");
    expect(inView()).toHaveAttribute("aria-current", "true");
    // The 23 leagues, Wood to Grand Master: Unranked is no slide (UNRANKED-PLACEHOLDER, the owner's ask of 2026-11-07).
    expect(carousel().querySelectorAll("[data-slot='carousel-item']")).toHaveLength(LEAGUES.length);
    // Under the title: the range of crowns alone (the owner's ask of 2026-11-05: the season's reward is the season row's).
    expect(within(inView()).getByRole("img", { name: "1,000 to 1,199 crowns" })).toBeInTheDocument();
    expect(within(inView()).queryByRole("img", { name: /Cobbles/ })).toBeNull();
    // No crowns' count in the card (#859): no way to the next league, no crowns to go.
    expect(within(carousel()).queryByRole("progressbar")).toBeNull();
    expect(within(carousel()).queryByText(/crowns to go|Reached/)).toBeNull();
    // The card has no ground of its own: the arrows outside it.
    const card = within(inView()).getByText("Bronze II").closest<HTMLElement>("[data-slot=league-card]")!;
    expect(card.className).not.toMatch(/\bborder\b|\bbg-card\b/);
    for (const name of ["Previous league", "Next league"]) expect(card).not.toContainElement(screen.getByRole("button", { name }));
    // No dots (the owner's ask of 2026-11-05: 24 were too many), no "N of 23".
    expect(screen.queryByRole("group", { name: "Go to a league" })).toBeNull();
    expect(carousel().parentElement!.querySelector("[data-slot=carousel-dots]")).toBeNull();
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

  it("every league's card has the same content (LEAGUE-PAGE, the book's): the crest beside the name and the range", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    const cards = carousel().querySelectorAll<HTMLElement>("[data-slot='league-card']");
    expect(cards).toHaveLength(LEAGUES.length);
    // One crest box for all, Wood included, at one size (#917): its height is the box's, the same clamp on every card.
    const crests = [...cards].map((c) => c.querySelector<HTMLElement>("[data-slot=league-crest-art]")!);
    expect(new Set(crests.map((f) => f.parentElement!.style.fontSize))).toEqual(new Set(["clamp(3.5rem, 19vw, 6rem)"]));
    expect(crests.map((f) => f.dataset.tier)).toEqual(LEAGUES.map((l) => l.id));
    // The name names the card: its heading, the first row beside the crest.
    expect(cards[0]!.querySelector("h2")).toHaveAccessibleName("Wood");
    expect(cards[13]!.querySelector("h2")).toHaveAccessibleName("Emerald III");
    for (const card of cards) expect(card.lastElementChild!.firstElementChild!.tagName).toBe("H2");
    // The crest, then the two rows (the name, the range); no bonus's corner since #917 (a lifetime league mission instead).
    for (const card of cards) expect(card.children).toHaveLength(2);
    for (const card of cards) expect(card.lastElementChild!.children).toHaveLength(2);
    expect(carousel().querySelector("[data-bonus]")).toBeNull();
    expect(crownRange(LEAGUES[0]!).text).toBe("0 – 399");
    expect(crownRange(LEAGUES[22]!).text).toBe("5,000+");
  });

  for (const reduced of ["never", "always"] as const) {
    it(`the arrows and the keys move through the leagues (reduced motion ${reduced})`, async () => {
      render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />, reduced));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Next league" }));
      expect(inView()).toHaveAccessibleName("Bronze I");
      expect(inView()).not.toHaveAttribute("aria-current");

      await user.click(screen.getByRole("button", { name: "Previous league" }));
      await user.click(screen.getByRole("button", { name: "Previous league" }));
      expect(inView()).toHaveAccessibleName("Bronze III");

      carousel().focus();
      await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
      expect(inView()).toHaveAccessibleName("Silver III");
      await user.keyboard("{ArrowLeft}");
      expect(inView()).toHaveAccessibleName("Bronze I");
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
        // At the drawer's header band's end, in the balances' place: no balance there.
        const header = screen.getByRole("dialog", { name: "League" }).querySelector<HTMLElement>("[data-slot=sheet-header]")!;
        expect(header).toContainElement(control());
        expect(within(header).queryAllByRole("region", { name: "Balances" })).toEqual([]);
        await userEvent.click(control());
        expect(inView()).toHaveAccessibleName("Bronze II");
        expect(inView()).toHaveAttribute("aria-current", "true");
        // The carousel comes into view, gliding, or at once under reduced motion; no navigation.
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: reduced === "always" ? "instant" : "smooth" });
        // It stops in the drawer's body with its top padding, under the header band (jsdom lays nothing out: the margin is the style;
        // the stories measure it).
        expect((scrollIntoView.mock.contexts[0] as HTMLElement).style.scrollMarginTop).toBe("1rem");
        // On the player's league already, a tap keeps it there.
        await userEvent.click(control());
        expect(inView()).toHaveAccessibleName("Bronze II");
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });
  }

  it("an Unranked player opens on Wood, none marked theirs; stops at Wood and at Grand Master", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.unranked} />));
    // Outside the leagues (no crown, no attack): the header alone reads Unranked (#917), with Unranked's crest; the carousel holds
    // the 23 leagues only (UNRANKED-PLACEHOLDER) and opens on Wood, the league a first attack enters, no slide the player's.
    expect(control()).toHaveAccessibleName("Your league: Unranked, 0 crowns. Show it");
    expect(control()).toHaveAttribute("data-tier", "unranked");
    expect(inView()).toHaveAccessibleName("Wood");
    expect(within(inView()).getByRole("img", { name: "0 to 399 crowns" })).toBeInTheDocument();
    expect(carousel().querySelector("[aria-current]")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Unranked" })).toBeNull();
    expect(screen.queryByText("Before the first attack")).toBeNull();
    expect(carousel().querySelector("[data-tier=unranked]")).toBeNull();
    expect(screen.getByRole("button", { name: "Previous league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(inView()).toHaveAccessibleName("Wood");
    await userEvent.keyboard("{ArrowRight}");
    expect(inView()).toHaveAccessibleName("Iron III");
    expect(inView()).not.toHaveAttribute("aria-current");
    // The header's League control brings an Unranked player back to Wood, still none marked theirs.
    await userEvent.click(control());
    expect(inView()).toHaveAccessibleName("Wood");
    expect(carousel().querySelector("[aria-current]")).toBeNull();
    cleanup();

    // In Wood after a first attack: the carousel opens on Wood, the player's, the first slide.
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.wood} />));
    expect(inView()).toHaveAccessibleName("Wood");
    expect(inView()).toHaveAttribute("aria-current", "true");
    expect(control()).toHaveAccessibleName("Your league: Wood, 120 crowns. Show it");
    expect(screen.getByRole("button", { name: "Previous league" })).toBeDisabled();
    cleanup();

    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.grandmaster} />));
    expect(inView()).toHaveAccessibleName("Grand Master");
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
