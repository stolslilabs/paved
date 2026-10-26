import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { LEAGUES } from "../src/lib/pvp-rules";
import { PvpLeagueScene } from "../src/components/scenes/pvp-league-scene";
import { PVP_LEAGUE } from "../src/mocks/pvp";

const wrap = (ui: ReactNode, reducedMotion: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reducedMotion}>{ui}</MotionConfig>
  </LazyMotion>
);
const carousel = () => screen.getByRole("region", { name: "Leagues" });
/** The slide in view: the others are out of the accessibility tree. */
const inView = () => within(carousel()).getByRole("group");
const position = () => screen.getByTestId("league-position");
const reach = (league: string) => within(screen.getByRole("group", { name: `${league} details` })).getByTestId("league-reach");

afterEach(cleanup);

describe("League carousel (#785)", () => {
  it("opens on the player's league, marked You, with its position; the list of every league is gone", () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.gold} />));
    expect(inView()).toHaveAccessibleName("Silver II");
    expect(inView()).toHaveAttribute("aria-current", "true");
    expect(within(inView()).getByText("You")).toBeInTheDocument();
    expect(position()).toHaveTextContent("Silver II · 6 of 23");
    expect(carousel().querySelectorAll("[data-slot='carousel-item']")).toHaveLength(LEAGUES.length);
    // The defence log's list of attacks is the page's own (BACK-RULE #783); no other list.
    expect(screen.queryAllByRole("list").map((l) => l.getAttribute("aria-label"))).toEqual(["Attacks"]);
    expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
    // The player's own: the way to the next league, as before.
    expect(screen.getByRole("progressbar", { name: "28 crowns to Silver I" })).toBeInTheDocument();
  });

  for (const reduced of ["never", "always"] as const) {
    it(`the arrows and the keys move through the leagues, the details follow (reduced motion ${reduced})`, async () => {
      render(wrap(<PvpLeagueScene {...PVP_LEAGUE.gold} />, reduced));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Next league" }));
      expect(inView()).toHaveAccessibleName("Silver I");
      expect(inView()).not.toHaveAttribute("aria-current");
      expect(within(screen.getByRole("group", { name: "Silver I details" })).getByRole("img", { name: "1,200 crowns" })).toBeInTheDocument();
      expect(reach("Silver I")).toHaveTextContent("28 to go");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(position()).toHaveTextContent("Silver I · 7 of 23");

      await user.click(screen.getByRole("button", { name: "Previous league" }));
      await user.click(screen.getByRole("button", { name: "Previous league" }));
      expect(inView()).toHaveAccessibleName("Silver III");
      expect(reach("Silver III")).toHaveTextContent("Reached");

      carousel().focus();
      await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
      expect(inView()).toHaveAccessibleName("Gold III");
      await user.keyboard("{ArrowLeft}");
      expect(inView()).toHaveAccessibleName("Silver I");
    });
  }

  it("a higher league shows its floor, the crowns to go, its rewards; Back to my league returns", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.higher} />));
    expect(inView()).toHaveAccessibleName("Gold II");
    expect(reach("Gold II")).toHaveTextContent("428 to go");
    const details = screen.getByRole("group", { name: "Gold II details" });
    expect(details).toHaveTextContent(/Season reward\+35/);
    expect(details).toHaveTextContent(/First time bonus\+15/);
    await userEvent.click(screen.getByRole("button", { name: "Back to my league" }));
    expect(inView()).toHaveAccessibleName("Silver II");
    expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
  });

  it("stops at Unranked and at Legend", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.unranked} />));
    expect(inView()).toHaveAccessibleName("Unranked");
    expect(screen.getByRole("heading", { name: "Unranked" })).toBeInTheDocument();
    expect(screen.getByText(/Attack a village to enter the leagues/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(inView()).toHaveAccessibleName("Unranked");
    cleanup();

    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.legend} />));
    expect(inView()).toHaveAccessibleName("Legend");
    expect(position()).toHaveTextContent("Legend · 23 of 23");
    expect(screen.getByText("The top league.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(inView()).toHaveAccessibleName("Legend");
    await userEvent.click(screen.getByRole("button", { name: "Previous league" }));
    expect(inView()).toHaveAccessibleName("Titan I");
    expect(reach("Titan I")).toHaveTextContent("Reached");
  });
});
