import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAGUES } from "../src/lib/pvp-rules";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { dotsWindow } from "../src/components/ui/carousel-dots";
import { BONUS_BURST_MS } from "../src/components/elements/league-bonus";
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
const dots = () => within(screen.getByRole("group", { name: "Go to a league" })).getAllByRole("button");
const current = () => dots().find((d) => d.getAttribute("aria-current") === "true");
const control = () => screen.getByRole("button", { name: /^Your league: .*\. Show it$/ });
const bonus = () => within(inView()).getByLabelText(/^First-time bonus/);

afterEach(cleanup);

describe("League carousel (#785, #833, #859)", () => {
  it("opens on the player's league; the card alone, no crowns' count; the dots in place of the position; no Attack, no back icon", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    expect(inView()).toHaveAccessibleName("Bronze II");
    expect(inView()).toHaveAttribute("aria-current", "true");
    expect(carousel().querySelectorAll("[data-slot='carousel-item']")).toHaveLength(LEAGUES.length);
    // Under the title: the range of crowns and the season's Cobbles.
    expect(within(inView()).getByRole("img", { name: "1,000 to 1,199 crowns" })).toBeInTheDocument();
    expect(within(inView()).getByRole("img", { name: "+20 Cobbles" })).toBeInTheDocument();
    // No crowns' count in the card (#859): no way to the next league, no crowns to go.
    expect(within(carousel()).queryByRole("progressbar")).toBeNull();
    expect(within(carousel()).queryByText(/crowns to go|Reached/)).toBeNull();
    // The card stands alone: the arrows and the dots outside it, no box around them.
    const card = within(inView()).getByText("Bronze II").closest<HTMLElement>("[data-slot=league-card]")!;
    expect(card).toHaveClass("rounded-xl", "border", "bg-card");
    for (const name of ["Previous league", "Next league", "Go to Bronze II"]) expect(card).not.toContainElement(screen.getByRole("button", { name }));
    expect(carousel().parentElement!.parentElement!.className).not.toMatch(/\bborder\b|\bbg-card\b/);
    // One dot per league, the current one marked; no "N of 23".
    expect(dots()).toHaveLength(LEAGUES.length);
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

  it("every league's card has the same content rows: the crest, the title, the range, the season reward", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    const cards = carousel().querySelectorAll<HTMLElement>("[data-slot='league-card']");
    expect(cards).toHaveLength(LEAGUES.length);
    // One fixed height for all, Wood included.
    expect(new Set([...cards].map((c) => [...c.classList].filter((k) => /^h-/.test(k)).join()))).toEqual(new Set(["h-40"]));
    // The bonus's corner (none for Wood), then the four rows.
    for (const card of cards) expect(card.children).toHaveLength(card.closest("[data-league]")!.getAttribute("data-league") === "0" ? 4 : 5);
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

  it("the first-time bonus: had up to the season's best league, out of reach above", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    // The season's best, 1,240, is in Bronze I: its bonus was had too.
    expect(bonus()).toHaveAccessibleName("First-time bonus, +10 Cobbles: had this season");
    await userEvent.click(screen.getByRole("button", { name: "Go to Bronze I" }));
    expect(bonus()).toHaveAttribute("data-bonus", "had");
    await userEvent.click(screen.getByRole("button", { name: "Go to Silver III" }));
    expect(bonus()).toHaveAccessibleName("First-time bonus, +15 Cobbles: reach Silver III to earn it");
    expect(bonus()).toHaveAttribute("data-bonus", "locked");
    await userEvent.click(screen.getByRole("button", { name: "Go to Wood" }));
    expect(within(inView()).queryByLabelText(/^First-time bonus/)).toBeNull();
    expect(within(inView()).getByText("No season reward")).toBeInTheDocument();
  });

  it("a drop to Wood keeps the season's bonuses had up to the season's best", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.demoted} />));
    // The header shows Wood's crest and the crowns now, 200.
    expect(control()).toHaveAccessibleName("Your league: Wood, 200 crowns. Show it");
    expect(control()).toHaveAttribute("data-league", "wood");
    expect(inView()).toHaveAccessibleName("Bronze II");
    expect(bonus()).toHaveAccessibleName("First-time bonus, +10 Cobbles: had this season");
    await userEvent.click(screen.getByRole("button", { name: "Go to Bronze I" }));
    expect(bonus()).toHaveAttribute("data-bonus", "had");
    await userEvent.click(screen.getByRole("button", { name: "Go to Silver III" }));
    expect(bonus()).toHaveAttribute("data-bonus", "locked");
    // The header's League control returns to the player's league, Wood.
    await userEvent.click(control());
    expect(inView()).toHaveAccessibleName("Wood");
  });

  for (const reduced of ["never", "always"] as const) {
    it(`a bonus to celebrate: a tap plays its moment and marks it seen, then it is had (reduced motion ${reduced})`, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const onBonusSeen = vi.fn();
        render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bonusReady} onBonusSeen={onBonusSeen} />, reduced));
        expect(bonus()).toHaveAccessibleName("First-time bonus, +10 Cobbles: earned, tap to celebrate");
        await userEvent.click(bonus());
        expect(within(inView()).getByRole("status")).toHaveTextContent("+10");
        // Seen at the tap: the moment plays once, whatever comes next.
        expect(onBonusSeen).toHaveBeenCalledExactlyOnceWith(5);
        expect(bonus()).toHaveAttribute("data-bonus", "had");
        await act(async () => {
          vi.advanceTimersByTime(BONUS_BURST_MS + 10);
        });
        expect(within(inView()).queryByRole("status")).toBeNull();
        expect(bonus()).toHaveAttribute("data-bonus", "had");
        expect(onBonusSeen).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  }

  it("leaving the league during the moment ends it; a return never replays it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onBonusSeen = vi.fn();
      render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bonusReady} onBonusSeen={onBonusSeen} />));
      await userEvent.click(bonus());
      expect(within(inView()).getByRole("status")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Next league" }));
      expect(inView()).toHaveAccessibleName("Bronze I");
      await act(async () => {
        vi.advanceTimersByTime(BONUS_BURST_MS + 300);
      });
      await userEvent.click(screen.getByRole("button", { name: "Previous league" }));
      expect(inView()).toHaveAccessibleName("Bronze II");
      expect(document.querySelector("[data-slot=bonus-burst]")).toBeNull();
      expect(bonus()).toHaveAttribute("data-bonus", "had");
      // Back at once, before the moment's end, the same.
      await userEvent.click(screen.getByRole("button", { name: "Next league" }));
      await userEvent.click(screen.getByRole("button", { name: "Previous league" }));
      expect(document.querySelector("[data-slot=bonus-burst]")).toBeNull();
      expect(onBonusSeen).toHaveBeenCalledExactlyOnceWith(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops at Wood and at Grand Master", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.wood} />));
    expect(inView()).toHaveAccessibleName("Wood");
    expect(screen.getByRole("heading", { name: "Wood" })).toBeInTheDocument();
    expect(control()).toHaveAccessibleName("Your league: Wood, 0 crowns. Show it");
    expect(screen.getByRole("button", { name: "Previous league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(inView()).toHaveAccessibleName("Wood");
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
