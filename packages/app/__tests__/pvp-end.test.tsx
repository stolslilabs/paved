import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { DAY_S } from "@paved/game-core";
import { PvpEndScene, starFills, type PvpEndSceneProps } from "../src/components/scenes/pvp-end-scene";
import { attackChestOrigin, attackEnd, endChest, endXp } from "../src/routes/pvp-v2-end";
import { PVP_END } from "../src/mocks/pvp";

// The end screen of a PvP v2 attack (#790; END-SCREENS, the book's `attack-end`): each state on the fakes, the chest opened here
// (END-CHEST) or capped, and the record's reading.

const never = () => new Promise<never>(() => {});

function show(data: Omit<PvpEndSceneProps, "onOpenChest" | "onVillage" | "onAgain">, reduced = false) {
  const on = { onOpenChest: vi.fn(), onVillage: vi.fn(), onAgain: vi.fn() };
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
    ["zeroStars", 0, "DEFEAT"],
    ["oneStar", 1, "VICTORY"],
    ["twoStars", 2, "VICTORY"],
    ["threeStars", 3, "VICTORY"],
  ] as const)("%s: the stars, the verdict and the score against the village's", (key, stars, verdict) => {
    const data = PVP_END[key];
    show(data);
    expect(screen.getByRole("img", { name: `${stars} of 3 stars` })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: verdict })).toBeInTheDocument();
    expect(screen.getByLabelText("Score")).toHaveTextContent(`${data.score.toLocaleString("en-US")} / ${data.target.toLocaleString("en-US")}`);
    // The stars in the bar's place (the owner's ask of 2026-11-06): no meter, each star filled by the score.
    expect(screen.queryByRole("meter")).toBeNull();
    // No closings' window, no League (the owner's asks of 2026-11-06).
    expect(screen.queryByRole("region", { name: "Closings" })).toBeNull();
    expect(screen.queryByRole("button", { name: /League/ })).toBeNull();
  });

  it("a won chest: the book's gold panel, Tap to open, a tap opens it here (END-CHEST)", async () => {
    const on = show(PVP_END.threeStars);
    const chest = screen.getByRole("region", { name: "Chest" });
    expect(chest).toHaveAttribute("data-state", "won");
    expect(chest).toHaveTextContent("Tap to open");
    await userEvent.click(within(chest).getByRole("button", { name: /^Open the epic chest/ }));
    expect(on.onOpenChest).toHaveBeenCalledOnce();
  });

  it("the chest opening, then its tile kept: said on the panel", () => {
    show({ ...PVP_END.threeStars, chest: { state: "opening", rank: "epic" } });
    expect(screen.getByRole("button", { name: "Epic chest: opening" })).toBeDisabled();
    cleanup();
    show({ ...PVP_END.threeStars, chest: { state: "kept", rank: "epic", plan: 7 } });
    const chest = screen.getByRole("region", { name: "Chest" });
    expect(chest).toHaveAttribute("data-state", "kept");
    expect(chest).toHaveTextContent("Added to your inventoryCity corner");
  });

  it("a chest the day's slots cannot take: grey, disabled, the slots' reset counting down; nothing to open", () => {
    show(PVP_END.chestCapped);
    const chest = screen.getByRole("region", { name: "Chest" });
    expect(chest).toHaveAttribute("data-state", "capped");
    expect(chest).toHaveAttribute("aria-disabled", "true");
    expect(chest).toHaveTextContent("No slot left today");
    expect(within(chest).getByRole("timer", { name: /^Slots reset in / })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Open the / })).toBeNull();
  });

  it("the chests' read not there: loading disabled; a failed read its message and Retry; unavailable carved, nothing to open (#1038)", async () => {
    show({ ...PVP_END.threeStars, chest: { state: "loading", rank: "epic" } });
    expect(screen.getByRole("button", { name: "Epic chest: loading" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Chest" })).toHaveTextContent("Loading…");
    cleanup();
    const onRetry = vi.fn();
    show({ ...PVP_END.threeStars, chest: { state: "error", rank: "epic", message: "The RPC did not answer.", onRetry } });
    let chest = screen.getByRole("region", { name: "Chest" });
    expect(within(chest).getByRole("alert")).toHaveTextContent("Could not load your epic chest: The RPC did not answer.");
    expect(within(chest).queryByRole("button", { name: /^Open the / })).toBeNull();
    await userEvent.click(within(chest).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    cleanup();
    show({ ...PVP_END.threeStars, chest: { state: "unavailable", rank: "epic" } });
    chest = screen.getByRole("region", { name: "Chest" });
    expect(chest).toHaveAttribute("aria-disabled", "true");
    expect(chest).toHaveTextContent("No chests here yetChests are not on this network yet.");
    expect(screen.queryByRole("button", { name: /^Open the / })).toBeNull();
  });

  it("no star: no chest", () => {
    show(PVP_END.zeroStars);
    expect(screen.queryByRole("region", { name: "Chest" })).toBeNull();
  });

  it("a promotion said in words", () => {
    show(PVP_END.threeStars);
    expect(screen.getByRole("region", { name: "Crowns" })).toHaveTextContent(/Promoted to.*Bronze I/);
  });

  it("a drop said in words", () => {
    show(PVP_END.dropped);
    expect(screen.getByRole("region", { name: "Crowns" })).toHaveTextContent(/Dropped to.*Bronze III/);
  });

  it("the XP gained, the level bar and a level up", () => {
    show(PVP_END.levelUp);
    const xp = screen.getByRole("region", { name: "Experience" });
    expect(xp).toHaveTextContent("+20 XP");
    expect(xp).toHaveTextContent("Level up!");
    expect(within(xp).getByRole("progressbar")).toBeInTheDocument();
  });

  it("a surrender: 'Surrendered' and the crowns it cost", () => {
    show(PVP_END.surrendered);
    expect(screen.getByRole("heading", { name: "Surrendered" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Crowns" })).getByRole("img", { name: /^-\d+ crowns?$/ })).toBeInTheDocument();
  });

  it("the book's answers, Home and Again (the owner's words)", async () => {
    const on = show(PVP_END.twoStars);
    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await userEvent.click(screen.getByRole("button", { name: "Again" }));
    expect(on.onVillage).toHaveBeenCalledOnce();
    expect(on.onAgain).toHaveBeenCalledOnce();
  });

  it("the cross closes the scores on the board, the Scores pill brings them back at once (the Board's place, 2026-11-06)", async () => {
    show(PVP_END.threeStars);
    await userEvent.click(screen.getByRole("button", { name: "Close the scores" }));
    expect(screen.queryByRole("region", { name: "Result" })).toBeNull();
    // The page keeps its name for a reader.
    expect(screen.getByRole("heading", { level: 1, name: "Attack over" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the scores" }));
    expect(screen.getByRole("region", { name: "Result" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 of 3 stars" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show the scores" })).toBeNull();
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

  it("a chest's origin is the attack's: its day and the slot it filled; an origin unknown passes, an attack's slot unknown takes no slotted chest (#1038)", () => {
    const finishedAt = 20_000 * DAY_S + 19 * 3_600;
    const attack = { finishedAt, chestSlot: 1 };
    expect(attackChestOrigin(attack, { source: "pvp", day: 20_000, slot: 1 })).toBe(true);
    expect(attackChestOrigin(attack, { source: "pvp", day: 20_000, slot: 0 })).toBe(false);
    expect(attackChestOrigin(attack, { source: "pvp", day: 19_999, slot: 1 })).toBe(false);
    expect(attackChestOrigin(attack, { source: "story" })).toBe(false);
    expect(attackChestOrigin(attack, null)).toBe(true);
    expect(attackChestOrigin(attack, { source: "pvp", day: 20_000 })).toBe(true);
    // An attack that does not know its slot never takes a chest that has one: it could be another attack's.
    expect(attackChestOrigin({ finishedAt }, { source: "pvp", day: 20_000, slot: 0 })).toBe(false);
    expect(attackChestOrigin({ finishedAt }, { source: "pvp", day: 20_000 })).toBe(true);
  });

  it("a capped chest's deadline does not roll forward at midnight: past it, the slots are said to be open again", () => {
    const chest = PVP_END.chestCapped.chest as Extract<PvpEndSceneProps["chest"], { state: "capped" }>;
    show({ ...PVP_END.chestCapped, now: chest.resetsAt - 30 });
    expect(screen.getByRole("region", { name: "Chest" })).toHaveTextContent("No slot left today");
    expect(screen.getByRole("timer", { name: "Slots reset in 0:00:30" })).toBeInTheDocument();
    cleanup();
    show({ ...PVP_END.chestCapped, now: chest.resetsAt });
    const region = screen.getByRole("region", { name: "Chest" });
    expect(region).toHaveTextContent("No slot was left that dayYour chest slots are open again.");
    expect(region).not.toHaveTextContent("No slot left today");
  });

  it("fills each star by the score: the first to 80 % of the village's score, the next to 90, the last to 100 (END-SCREENS)", () => {
    expect(starFills(0, 1000)).toEqual([0, 0, 0]);
    expect(starFills(400, 1000)).toEqual([0.5, 0, 0]);
    expect(starFills(950, 1000).map((f) => Math.round(f * 100))).toEqual([100, 100, 50]);
    expect(starFills(1200, 1000)).toEqual([1, 1, 1]);
  });

  it("draws a star partly filled grey beyond its share and without its shine; a full one shines", () => {
    show({ ...PVP_END.twoStars });
    const stars = [...document.querySelectorAll<HTMLElement>("[data-testid=star-fill] > [data-fill]")];
    expect(stars.map((s) => s.dataset.fill)).toEqual(["100", "100", expect.stringMatching(/^\d+$/)]);
    expect(Number(stars[2]!.dataset.fill)).toBeLessThan(100);
    expect(stars[2]!.querySelector("[data-slot=prize-halo]")).toBeNull();
    expect(stars[0]!.querySelector("[data-slot=prize-halo]")).not.toBeNull();
  });

  it("the XP and the level it leaves, a level up when the gain crossed one", () => {
    expect(endXp(1_010, 20)).toMatchObject({ gained: 20, level: 5, floor: 1_000, next: 1_500, levelBefore: 4 });
    expect(endXp(1_480, 10)).toMatchObject({ level: 5, levelBefore: 5 });
  });

  it("the final board", () => {
    const empty = attackEnd({ moves: [] });
    expect(empty.tiles).toHaveLength(1);
    const discarded = attackEnd({ moves: [{ plan: 1, discard: true }] });
    expect(discarded.tiles).toHaveLength(1);
  });
});
