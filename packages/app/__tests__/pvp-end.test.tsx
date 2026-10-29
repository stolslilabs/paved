import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { DAY_S } from "@paved/game-core";
import { PvpEndScene, waitText, type PvpEndSceneProps } from "../src/components/scenes/pvp-end-scene";
import { attackEnd, endChest, endXp } from "../src/routes/pvp-v2-end";
import { PVP_END } from "../src/mocks/pvp";

// The end screen of a PvP v2 attack (#790): each state on the fakes, the capped chest, and the record's reading.

const never = () => new Promise<never>(() => {});

function show(data: Omit<PvpEndSceneProps, "onOpenChest" | "onAgain" | "onLeague" | "onBack">, reduced = false) {
  const on = { onOpenChest: vi.fn(), onAgain: vi.fn(), onLeague: vi.fn(), onBack: vi.fn() };
  render(
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>
        <PvpEndScene {...data} loadBoard={never} {...on} />
      </MotionConfig>
    </LazyMotion>,
  );
  return on;
}

describe("PvpEndScene (#790)", () => {
  it.each([
    ["zeroStars", 0, "Defeat"],
    ["oneStar", 1, "Victory"],
    ["twoStars", 2, "Victory"],
    ["threeStars", 3, "Triumph"],
  ] as const)("%s: the stars, the verdict and the score against the village's", (key, stars, verdict) => {
    const data = PVP_END[key];
    show(data);
    expect(screen.getByRole("img", { name: `${stars} of 3 stars` })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: verdict })).toBeInTheDocument();
    expect(screen.getByLabelText("Score")).toHaveTextContent(`${data.score.toLocaleString("en-US")} / ${data.target.toLocaleString("en-US")}`);
    expect(screen.getByRole("meter")).toHaveAttribute("data-stars", String(stars));
    expect(screen.getByRole("region", { name: "Closings" })).toHaveTextContent("Every closing");
  });

  it("a won chest: its rank, and Open chest leads on", async () => {
    const on = show(PVP_END.threeStars);
    const chest = screen.getByRole("region", { name: "Chest" });
    expect(chest).toHaveAttribute("data-state", "won");
    expect(chest).toHaveTextContent("Epic chest won");
    await userEvent.click(screen.getByRole("button", { name: /Open chest/ }));
    expect(on.onOpenChest).toHaveBeenCalledOnce();
  });

  it("a chest the day's slots cannot take: grey, disabled, with its reason; no Open chest", () => {
    show(PVP_END.chestCapped);
    const chest = screen.getByRole("region", { name: "Chest" });
    expect(chest).toHaveAttribute("data-state", "capped");
    expect(chest).toHaveAttribute("aria-disabled", "true");
    expect(chest).toHaveTextContent("No slot left today, next in 5 h.");
    expect(screen.queryByRole("button", { name: /Open chest/ })).toBeNull();
  });

  it("no star: no chest", () => {
    show(PVP_END.zeroStars);
    expect(screen.queryByRole("region", { name: "Chest" })).toBeNull();
  });

  it("a promotion said in words", () => {
    show(PVP_END.threeStars);
    expect(screen.getByRole("region", { name: "Crowns" })).toHaveTextContent(/Promoted to.*Yeoman I/);
  });

  it("a drop said in words", () => {
    show(PVP_END.dropped);
    expect(screen.getByRole("region", { name: "Crowns" })).toHaveTextContent(/Dropped to.*Yeoman III/);
  });

  it("the XP gained, the level bar and a level up", () => {
    show(PVP_END.levelUp);
    const xp = screen.getByRole("region", { name: "Experience" });
    expect(xp).toHaveTextContent("+20 XP");
    expect(xp).toHaveTextContent(/Level up: \d+/);
    expect(within(xp).getByRole("progressbar")).toBeInTheDocument();
  });

  it("a surrender: 'Surrendered' and the crowns it cost", () => {
    show(PVP_END.surrendered);
    expect(screen.getByRole("heading", { name: "Surrendered" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Crowns" })).getByRole("img", { name: /^-\d+ crowns?$/ })).toBeInTheDocument();
  });

  it("Attack again and League", async () => {
    const on = show(PVP_END.twoStars);
    await userEvent.click(screen.getByRole("button", { name: /Attack again/ }));
    await userEvent.click(screen.getByRole("button", { name: /League/ }));
    expect(on.onAgain).toHaveBeenCalledOnce();
    expect(on.onLeague).toHaveBeenCalledOnce();
  });

  it("reduced motion: the stars show at once, without the animation", () => {
    show(PVP_END.threeStars, true);
    for (const star of document.querySelectorAll("[data-lit]")) expect((star as HTMLElement).style.opacity).not.toBe("0");
  });
});

describe("the end's reading of the record (#790)", () => {
  it("a chest granted is won; stars with none granted are the capped day, until the UTC day after the attack's end; no star or a surrender, none", () => {
    const finishedAt = 20_000 * DAY_S + 19 * 3_600;
    expect(endChest({ chest: "rare", stars: 2, status: "finished", finishedAt })).toEqual({ state: "won", rank: "rare" });
    expect(endChest({ chest: null, stars: 3, status: "finished", finishedAt })).toEqual({ state: "capped", rank: "epic", resetsAt: 20_001 * DAY_S });
    expect(endChest({ chest: null, stars: 0, status: "finished", finishedAt })).toEqual({ state: "none" });
    expect(endChest({ chest: null, stars: 0, status: "surrendered", finishedAt })).toEqual({ state: "none" });
  });

  it("a capped chest's deadline does not roll forward at midnight: past it, the slots are said to be open again", () => {
    const chest = PVP_END.chestCapped.chest as Extract<PvpEndSceneProps["chest"], { state: "capped" }>;
    show({ ...PVP_END.chestCapped, now: chest.resetsAt - 30 });
    expect(screen.getByRole("region", { name: "Chest" })).toHaveTextContent("No slot left today, next in 1 min.");
    cleanup();
    show({ ...PVP_END.chestCapped, now: chest.resetsAt });
    const region = screen.getByRole("region", { name: "Chest" });
    expect(region).toHaveTextContent("No slot was left that day. Your chest slots are open again.");
    expect(region).not.toHaveTextContent("No slot left today");
  });

  it("the wait for the next slot, in hours from an hour, in minutes under it", () => {
    expect(waitText(5 * 3_600)).toBe("5 h");
    expect(waitText(4 * 3_600 + 1)).toBe("5 h");
    expect(waitText(12 * 60)).toBe("12 min");
    expect(waitText(0)).toBe("1 min");
  });

  it("the XP and the level it leaves, a level up when the gain crossed one", () => {
    expect(endXp(1_010, 20)).toMatchObject({ gained: 20, level: 5, floor: 1_000, next: 1_500, levelBefore: 4 });
    expect(endXp(1_480, 10)).toMatchObject({ level: 5, levelBefore: 5 });
  });

  it("the final board and every closing, with the move that closed it", () => {
    const empty = attackEnd({ moves: [] });
    expect(empty.tiles).toHaveLength(1);
    expect(empty.closings).toEqual([]);
    const discarded = attackEnd({ moves: [{ plan: 1, discard: true }] });
    expect(discarded.tiles).toHaveLength(1);
  });
});
