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
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.yeoman} />));
    expect(inView()).toHaveAccessibleName("Yeoman II");
    expect(inView()).toHaveAttribute("aria-current", "true");
    expect(within(inView()).getByText("You")).toBeInTheDocument();
    expect(position()).toHaveTextContent("Yeoman II · 6 of 23");
    expect(carousel().querySelectorAll("[data-slot='carousel-item']")).toHaveLength(LEAGUES.length);
    // The list of the latest matches is the page's own (#786); no other list.
    expect(screen.queryAllByRole("list").map((l) => l.getAttribute("aria-label"))).toEqual(["Matches"]);
    expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
    // The player's own: the way to the next league, as before.
    expect(screen.getByRole("progressbar", { name: "28 crowns to Yeoman I" })).toBeInTheDocument();
  });

  for (const reduced of ["never", "always"] as const) {
    it(`the arrows and the keys move through the leagues, the details follow (reduced motion ${reduced})`, async () => {
      render(wrap(<PvpLeagueScene {...PVP_LEAGUE.yeoman} />, reduced));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Next league" }));
      expect(inView()).toHaveAccessibleName("Yeoman I");
      expect(inView()).not.toHaveAttribute("aria-current");
      expect(within(screen.getByRole("group", { name: "Yeoman I details" })).getByRole("img", { name: "1,200 crowns" })).toBeInTheDocument();
      expect(reach("Yeoman I")).toHaveTextContent("28 to go");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(position()).toHaveTextContent("Yeoman I · 7 of 23");

      await user.click(screen.getByRole("button", { name: "Previous league" }));
      await user.click(screen.getByRole("button", { name: "Previous league" }));
      expect(inView()).toHaveAccessibleName("Yeoman III");
      expect(reach("Yeoman III")).toHaveTextContent("Reached");

      carousel().focus();
      await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
      expect(inView()).toHaveAccessibleName("Squire III");
      await user.keyboard("{ArrowLeft}");
      expect(inView()).toHaveAccessibleName("Yeoman I");
    });
  }

  it("a higher league shows its floor, the crowns to go, its rewards; Back to my league returns", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.higher} />));
    expect(inView()).toHaveAccessibleName("Squire II");
    expect(reach("Squire II")).toHaveTextContent("428 to go");
    const details = screen.getByRole("group", { name: "Squire II details" });
    expect(details).toHaveTextContent(/Season reward\+35/);
    expect(details).toHaveTextContent(/First time bonus\+15/);
    await userEvent.click(screen.getByRole("button", { name: "Back to my league" }));
    expect(inView()).toHaveAccessibleName("Yeoman II");
    expect(screen.queryByRole("button", { name: "Back to my league" })).toBeNull();
  });

  it("stops at Wanderer and at Sovereign", async () => {
    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.wanderer} />));
    expect(inView()).toHaveAccessibleName("Wanderer");
    expect(screen.getByRole("heading", { name: "Wanderer" })).toBeInTheDocument();
    expect(screen.getByText(/Attack a village to enter the leagues/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(inView()).toHaveAccessibleName("Wanderer");
    cleanup();

    render(wrap(<PvpLeagueScene {...PVP_LEAGUE.sovereign} />));
    expect(inView()).toHaveAccessibleName("Sovereign");
    expect(position()).toHaveTextContent("Sovereign · 23 of 23");
    expect(screen.getByText("The top league.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next league" })).toBeDisabled();
    carousel().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(inView()).toHaveAccessibleName("Sovereign");
    await userEvent.click(screen.getByRole("button", { name: "Previous league" }));
    expect(inView()).toHaveAccessibleName("Duke I");
    expect(reach("Duke I")).toHaveTextContent("Reached");
  });
});
