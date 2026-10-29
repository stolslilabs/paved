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
const reach = () => within(inView()).getByTestId("league-reach");
const bonus = () => within(inView()).getByLabelText(/^First-time bonus/);

afterEach(cleanup);

describe("League carousel (#785, #833)", () => {
  it("opens on the player's league with the way to the next; the dots in place of the position; no Attack, no back icon", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    expect(inView()).toHaveAccessibleName("Bronze II");
    expect(inView()).toHaveAttribute("aria-current", "true");
    expect(carousel().querySelectorAll("[data-slot='carousel-item']")).toHaveLength(LEAGUES.length);
    // Under the title: the range of crowns and the season's Cobbles.
    expect(within(inView()).getByRole("img", { name: "1,000 to 1,199 crowns" })).toBeInTheDocument();
    expect(within(inView()).getByRole("img", { name: "+20 Cobbles" })).toBeInTheDocument();
    expect(within(inView()).getByRole("progressbar", { name: "28 crowns to Bronze I" })).toBeInTheDocument();
    // One dot per league, the current one marked; no "N of 23".
    expect(dots()).toHaveLength(LEAGUES.length);
    expect(current()).toHaveAccessibleName("Go to Bronze II");
    expect(screen.queryByText(/of 23/)).toBeNull();
    expect(screen.queryByTestId("league-position")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Attack/ })).toBeNull();
    // The player's crowns, the same under every league.
    expect(screen.getByTestId("league-player")).toHaveTextContent(/Your crowns.*Season best/);
    // The list of the latest matches is the page's own (#786); no other list.
    expect(screen.queryAllByRole("list").map((l) => l.getAttribute("aria-label"))).toEqual(["Matches"]);
  });

  it("every league's card has the same content rows: the title, the range, the season reward, the standing line", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.bronze} />));
    const cards = carousel().querySelectorAll<HTMLElement>("[data-slot='league-card']");
    expect(cards).toHaveLength(LEAGUES.length);
    // One fixed height for all, Wood included.
    expect(new Set([...cards].map((c) => [...c.classList].filter((k) => /^h-/.test(k)).join()))).toEqual(new Set(["h-56"]));
    for (const card of cards) expect(card.children).toHaveLength(6);
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
      expect(reach()).toHaveTextContent("28 crowns to go");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(current()).toHaveAccessibleName("Go to Bronze I");

      await user.click(screen.getByRole("button", { name: "Previous league" }));
      await user.click(screen.getByRole("button", { name: "Previous league" }));
      expect(inView()).toHaveAccessibleName("Bronze III");
      expect(reach()).toHaveTextContent("Reached");

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

  it("the back icon shows away from the player's league and returns to it", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.higher} />));
    expect(inView()).toHaveAccessibleName("Silver II");
    expect(reach()).toHaveTextContent("428 crowns to go");
    await userEvent.click(within(inView()).getByRole("button", { name: "Back to my league" }));
    expect(inView()).toHaveAccessibleName("Bronze II");
    expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
  });

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
    expect(screen.getByTestId("league-player")).toHaveTextContent(/Your crowns.*200.*Season best.*1,240/);
    expect(inView()).toHaveAccessibleName("Bronze II");
    expect(bonus()).toHaveAccessibleName("First-time bonus, +10 Cobbles: had this season");
    await userEvent.click(screen.getByRole("button", { name: "Go to Bronze I" }));
    expect(bonus()).toHaveAttribute("data-bonus", "had");
    await userEvent.click(screen.getByRole("button", { name: "Go to Silver III" }));
    expect(bonus()).toHaveAttribute("data-bonus", "locked");
    // The back icon returns to the player's league, Wood.
    await userEvent.click(within(inView()).getByRole("button", { name: "Back to my league" }));
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
    // Unranked's longer text is under the carousel, out of the card.
    expect(screen.getByTestId("league-player")).toHaveTextContent(/Attack a village to enter the leagues/);
    expect(within(inView()).getByRole("progressbar", { name: "400 crowns to Iron III" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(inView()).toHaveAccessibleName("Wood");
    cleanup();

    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.grandmaster} />));
    expect(inView()).toHaveAccessibleName("Grand Master");
    expect(current()).toHaveAccessibleName("Go to Grand Master");
    expect(within(inView()).getByText("The top league.")).toBeInTheDocument();
    expect(within(inView()).getByRole("img", { name: "5,000 crowns and more" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(inView()).toHaveAccessibleName("Grand Master");
    await userEvent.click(screen.getByRole("button", { name: "Previous league" }));
    expect(inView()).toHaveAccessibleName("Master I");
    expect(reach()).toHaveTextContent("Reached");
  });

  it("the dots' window holds inside the row (open point 2)", () => {
    expect(dotsWindow(23, 0, 23)).toBe(0);
    expect(dotsWindow(23, 0, 9)).toBe(0);
    expect(dotsWindow(23, 11, 9)).toBe(7);
    expect(dotsWindow(23, 22, 9)).toBe(14);
  });
});
