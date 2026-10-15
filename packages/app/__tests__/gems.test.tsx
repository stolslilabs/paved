import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Gems, formatGems } from "../src/components/elements/gems";
import { formatUsd } from "../src/components/containers/gem-packs";
import { PLANS, applySkinChanges, isClaimed, packDiscount, referencePrice, toggleSkin } from "../src/components/containers/gem-types";
import { SkinGrid } from "../src/components/containers/skin-grid";
import { AchievementsScene } from "../src/components/scenes/achievements-scene";
import { HomeScene } from "../src/components/scenes/home-scene";
import { LeaderboardScene } from "../src/components/scenes/leaderboard-scene";
import { PlayScene } from "../src/components/scenes/play-scene";
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import { QuestsScene } from "../src/components/scenes/quests-scene";
import { ThemeScene } from "../src/components/scenes/theme-scene";
import { ACHIEVEMENT_GEMS, PACKS, PLAN_COUNTS, QUEST_GEMS, SKIN_PRICES, activeOn, bits, ownedPlans, skinPrice } from "../src/mocks/gems";
import { QUEST_DEFINITIONS } from "../src/mocks/quests";
import { ACHIEVEMENTS, HOME, LEADERBOARD, PLAY, PURCHASE, QUESTS, THEME } from "../src/mocks/scenes";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

// The amounts are gems-v1.md's: a mismatch here is a mock that drifted from the design.
describe("gems amounts (gems-v1.md)", () => {
  it("sells the owner's four tiers, each against the $0.20 reference (2.1)", () => {
    expect(PACKS.map((p) => [p.gems, formatUsd(p.price), formatUsd(referencePrice(p.gems)), packDiscount(p)])).toEqual([
      [50, "$5", "$10", 50],
      [100, "$9", "$20", 55],
      [500, "$40", "$100", 60],
      [1_000, "$70", "$200", 65],
    ]);
    expect(PACKS.map((p) => formatUsd(p.price / BigInt(p.gems), 2))).toEqual(["$0.10", "$0.09", "$0.08", "$0.07"]);
  });

  it("gives quests 5, 10 or 15 by their family's target, Daily Run 5 and a weekly 15 (3.1)", () => {
    expect(QUEST_GEMS.map((q) => q.questId)).toEqual(QUEST_DEFINITIONS.map((d) => d.questId));
    expect(Object.fromEntries(QUEST_GEMS.map((q) => [q.questId, q.gems]))).toEqual({ 1: 5, 5: 5, 6: 10, 7: 15, 8: 5, 9: 10, 10: 15, 11: 5, 12: 10, 13: 15, 14: 15, 15: 15, 16: 15 });
    expect(QUEST_GEMS.filter((q) => q.kind === 2).map((q) => q.questId)).toEqual([14, 15, 16]);
  });

  it("gives an achievement its points, On the Podium none: 580 for the fifteen (3.1)", () => {
    expect(ACHIEVEMENT_GEMS.map((a) => a.achievementId)).not.toContain(9);
    expect(ACHIEVEMENT_GEMS).toHaveLength(15);
    expect(ACHIEVEMENT_GEMS.reduce((sum, a) => sum + a.gems, 0)).toBe(580);
  });

  it("prices the 19 plans by rarity, 50 to 100, 1,580 for a theme (5.2)", () => {
    expect(PLANS).toBe(19);
    expect(PLAN_COUNTS.reduce((a, b) => a + b, 0)).toBe(72);
    expect([1, 2, 3, 4, 5, 8, 9].map(skinPrice)).toEqual([100, 95, 90, 80, 75, 55, 50]);
    expect(SKIN_PRICES).toEqual([100, 80, 90, 90, 90, 95, 75, 75, 80, 55, 75, 90, 50, 90, 90, 80, 100, 80, 95]);
    expect(SKIN_PRICES.reduce((a, b) => a + b, 0)).toBe(1_580);
  });

  it("reads a claim word bit by id", () => {
    expect(isClaimed(bits(1, 5), 5)).toBe(true);
    expect(isClaimed(bits(1, 5), 6)).toBe(false);
  });

  it("writes a gem count with commas, its name for a screen reader", () => {
    expect(formatGems(1_580)).toBe("1,580");
    render(<Gems value={15} sign="+" />);
    expect(screen.getByRole("img", { name: "+15 gems" })).toHaveTextContent("+15");
  });
});

describe("skin switches (5.3)", () => {
  const saved = activeOn(1, 10, 13);

  it("switches a skin on, then off again, and leaves the batch when back to the saved set", () => {
    const on = toggleSkin(saved, {}, 7, 1);
    expect(on).toEqual({ 7: 1 });
    expect(toggleSkin(saved, on, 7, 1)).toEqual({});
    expect(toggleSkin(saved, {}, 10, 1)).toEqual({ 10: 0 });
  });

  it("keeps one theme per plan: switching Forest on replaces Snow's skin of that plan", () => {
    const snow = activeOn(2, 7);
    const changes = toggleSkin(snow, {}, 7, 1);
    expect(applySkinChanges(snow, changes)[6]).toBe(1);
    expect(applySkinChanges(snow, changes).filter((t) => t === 2)).toHaveLength(0);
  });

  it("says so on the owned cell of a plan another theme has active", () => {
    render(<SkinGrid theme="forest" prices={SKIN_PRICES} owned={ownedPlans(7)} active={activeOn(2, 7)} balance={0} />);
    expect(screen.getByRole("listitem", { name: "Tile ffffcccff" })).toHaveTextContent("Replaces Snow");
  });
});

describe("Purchase: gems", () => {
  it("shows the four packs, the reference struck through, and asks for a pick", () => {
    render(wrap(<PurchaseScene {...PURCHASE.gemPacks} />));
    const packs = within(screen.getByRole("radiogroup", { name: "Gem packs" })).getAllByRole("radio");
    expect(packs.map((p) => p.getAttribute("aria-label"))).toEqual(["50 gems for $5, 50% off", "100 gems for $9, 55% off", "500 gems for $40, 60% off", "1000 gems for $70, 65% off"]);
    expect(packs[1]).toHaveTextContent("instead of $20");
    expect(screen.getByRole("button", { name: "Pick a pack" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Gems", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "240 gems" })).toBeInTheDocument();
  });

  it("confirms the pack picked, and selects another", async () => {
    const onBuyPack = vi.fn();
    const onSelectPack = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.gemPackPicked} onBuyPack={onBuyPack} onSelectPack={onSelectPack} />));
    expect(screen.getByRole("radio", { name: /^100 gems/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: /Pay \$9 for/ }));
    expect(onBuyPack).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("radio", { name: /^500 gems/ }));
    expect(onSelectPack).toHaveBeenCalledWith(3);
  });

  it("names the referrer's share", () => {
    render(wrap(<PurchaseScene {...PURCHASE.gemPackReferred} />));
    expect(screen.getByText(/Your referrer gets 5% of the price/)).toBeInTheDocument();
  });

  it("waits for the wallet while buying, the packs locked", () => {
    render(wrap(<PurchaseScene {...PURCHASE.gemPackBuying} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toBeDisabled();
    expect(screen.getAllByRole("radio").every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });

  it("refuses a pack the wallet cannot pay", () => {
    render(wrap(<PurchaseScene {...PURCHASE.gemPackShort} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough USDC");
    expect(screen.getByRole("button", { name: /Pay \$70/ })).toBeDisabled();
  });

  it("keeps the game's purchase on the Game tab", async () => {
    const onTab = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.gemPacks} tab="game" onTab={onTab} />));
    expect(screen.getByRole("heading", { name: "Stake" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Gems" }));
    expect(onTab).toHaveBeenCalledWith("gems");
  });

  it("shows no tab without gems", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("renders its stress state", () => {
    render(wrap(<PurchaseScene {...PURCHASE.gemStress} />));
    expect(screen.getByRole("img", { name: "987,654,321 gems" })).toBeInTheDocument();
  });
});

describe("Theme: skins", () => {
  const cell = (plan: string) => screen.getByRole("listitem", { name: `Tile ${plan}` });

  it("draws the 19 plans with their price and state, and counts the active ones", () => {
    render(wrap(<ThemeScene {...THEME.skins} />));
    const grid = screen.getByRole("list", { name: "Skins" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(19);
    expect(screen.getByText("of").parentElement).toHaveTextContent("2 of 19 active");
    expect(cell("rfrfffffr")).toHaveAttribute("data-state", "active");
    expect(cell("ffffcccff")).toHaveAttribute("data-state", "owned");
    expect(cell("ccccccccc")).toHaveAttribute("data-state", "none");
    expect(within(cell("ccccccccc")).getByRole("img", { name: "100 gems" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("buys and switches a skin", async () => {
    const onBuySkin = vi.fn();
    const onToggleSkin = vi.fn();
    render(wrap(<ThemeScene {...THEME.skins} onBuySkin={onBuySkin} onToggleSkin={onToggleSkin} />));
    await userEvent.click(screen.getByRole("button", { name: "Buy Tile ccccccccc for 100 gems" }));
    expect(onBuySkin).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole("switch", { name: "Tile ffffcccff skin active" }));
    expect(onToggleSkin).toHaveBeenCalledWith(7);
  });

  it("batches the changes and saves them in one write", async () => {
    const onSaveSkins = vi.fn();
    render(wrap(<ThemeScene {...THEME.skinsChanged} onSaveSkins={onSaveSkins} />));
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(bar).toHaveTextContent("2 changes to save");
    expect(cell("ffffcccff")).toHaveAttribute("data-state", "active");
    expect(cell("rfrfffffr")).toHaveAttribute("data-state", "owned");
    await userEvent.click(within(bar).getByRole("button", { name: "Save" }));
    expect(onSaveSkins).toHaveBeenCalledOnce();
  });

  it("locks the switches while saving, then says saved", () => {
    const { unmount } = render(wrap(<ThemeScene {...THEME.skinsSaving} />));
    expect(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(screen.getAllByRole("switch").every((s) => (s as HTMLButtonElement).disabled)).toBe(true);
    unmount();
    render(wrap(<ThemeScene {...THEME.skinsSaved} />));
    expect(screen.getByRole("status")).toHaveTextContent("Skins saved");
  });

  it("asks a player with no gems to get some, every Buy disabled", async () => {
    const onBuyGems = vi.fn();
    render(wrap(<ThemeScene {...THEME.noGems} onBuyGems={onBuyGems} />));
    expect(screen.getByText("No gems yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Buy / }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Get gems" }));
    expect(onBuyGems).toHaveBeenCalledOnce();
  });

  it("disables what the player cannot afford, with the gems missing", () => {
    render(wrap(<ThemeScene {...THEME.cantAfford} />));
    expect(within(cell("rfrfffffr")).getByRole("button", { name: /^Buy/ })).toBeEnabled();
    expect(within(cell("rfffrfffr")).getByRole("button", { name: /^Buy/ })).toBeEnabled();
    expect(within(cell("ccccccccc")).getByRole("button", { name: /^Buy/ })).toBeDisabled();
    expect(cell("ccccccccc")).toHaveTextContent("Need 40 more");
  });

  it("shows a purchase on its way, the other skins waiting", () => {
    render(wrap(<ThemeScene {...THEME.buying} />));
    expect(within(cell("ccccccccc")).getByRole("button", { name: /^Buy/ })).toHaveAttribute("aria-busy", "true");
    expect(within(cell("cccccfffc")).getByRole("button", { name: /^Buy/ })).toBeDisabled();
  });

  it("counts the whole set", () => {
    render(wrap(<ThemeScene {...THEME.allActive} />));
    expect(screen.getByText("The whole set")).toBeInTheDocument();
    expect(screen.getAllByRole("switch", { checked: true })).toHaveLength(19);
  });

  it("says a theme without prices is coming soon", async () => {
    const onBrowse = vi.fn();
    render(wrap(<ThemeScene {...THEME.comingSoon} onBrowse={onBrowse} />));
    expect(screen.getByText("Snow skins: coming soon")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Skins" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Forest" }));
    expect(onBrowse).toHaveBeenCalledWith("forest");
  });

  it("renders its stress state", () => {
    render(wrap(<ThemeScene {...THEME.skinsStress} />));
    expect(screen.getByRole("img", { name: "987,654,321 gems" })).toBeInTheDocument();
  });
});

describe("Quests: gems and free games", () => {
  it("shows each quest's gems, and the claimable one with Claim", async () => {
    const onClaim = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.gemsToday} onClaim={onClaim} />));
    expect(within(screen.getByRole("article", { name: "Strong Day" })).getByRole("img", { name: "+10 gems" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Strong Day" })).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Claim 5 gems: Daily Run" }));
    expect(onClaim).toHaveBeenCalledWith(1);
    expect(screen.getByRole("region", { name: "Free games" })).toHaveTextContent("1 of 4 dailies done");
    expect(screen.getByRole("button", { name: "Claim the daily free game" })).toBeDisabled();
  });

  it("marks a claimed quest", () => {
    render(wrap(<QuestsScene {...QUESTS.gemsClaimed} />));
    expect(within(screen.getByRole("article", { name: "Daily Run" })).getByText("Gems claimed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim all/ })).not.toBeInTheDocument();
  });

  it("keeps a past day claimable: Claim all and the day's free game", async () => {
    const onClaimAll = vi.fn();
    const onClaimCredit = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.gemsPastDay} onClaimAll={onClaimAll} onClaimCredit={onClaimCredit} />));
    expect(screen.getByText("Closed day")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Claim all/ }));
    expect(onClaimAll).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /^Claim all/ })).toHaveTextContent("+20");
    await userEvent.click(screen.getByRole("button", { name: "Claim the daily free game" }));
    expect(onClaimCredit).toHaveBeenCalledWith("daily");
  });

  it("shows Claim all on its way, the other claims waiting", () => {
    render(wrap(<QuestsScene {...QUESTS.gemsClaiming} />));
    expect(screen.getByRole("button", { name: /Claiming/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Claim the daily free game" })).toBeDisabled();
  });

  it("counts the free games and offers Play free", async () => {
    const onPlayFree = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.gemsFreeGame} onPlayFree={onPlayFree} />));
    expect(screen.getByLabelText("1 free game left")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Claimed" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play free" }));
    expect(onPlayFree).toHaveBeenCalledOnce();
  });

  it("offers the week's free game once its three are done", () => {
    render(wrap(<QuestsScene {...QUESTS.gemsWeekDone} />));
    expect(screen.getByRole("button", { name: "Claim the weekly free game" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Claim all/ })).toHaveTextContent("+45");
  });
});

describe("Achievements: gems", () => {
  it("shows each one's gems, claimed and claimable, and none for On the Podium", async () => {
    const onClaim = vi.fn();
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.gems} onClaim={onClaim} />));
    expect(within(screen.getByRole("article", { name: "First Stone" })).getByText("Gems claimed")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "On the Podium" })).queryByRole("img", { name: /gems/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Claim 20 gems: Settler II/ }));
    expect(onClaim).toHaveBeenCalledWith(3);
    expect(screen.getByRole("button", { name: /^Claim all/ })).toHaveTextContent("+40");
  });

  it("shows Claim all on its way", () => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.gemsClaiming} />));
    expect(screen.getAllByRole("button", { name: /Claiming|Claim/ }).some((b) => b.getAttribute("aria-busy") === "true")).toBe(true);
  });

  it("has nothing left to claim when all are claimed", () => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.gemsAllClaimed} />));
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Gems claimed")).toHaveLength(15);
  });
});

describe("Home, Play and Leaderboard: gems", () => {
  it("shows the balance on Home", () => {
    render(wrap(<HomeScene {...HOME.gems} />));
    expect(screen.getByRole("img", { name: "240 gems" })).toBeInTheDocument();
    expect(screen.queryByText("Free game")).not.toBeInTheDocument();
  });

  it("offers a free game on Home and Play that spends a credit", async () => {
    const onPlayFree = vi.fn();
    const { unmount } = render(wrap(<HomeScene {...HOME.freeGame} onPlayFree={onPlayFree} />));
    await userEvent.click(screen.getByRole("button", { name: /Free game/ }));
    expect(screen.getByText("2 free Challenge games from your quests.")).toBeInTheDocument();
    unmount();
    render(wrap(<PlayScene {...PLAY.freeGame} onPlayFree={onPlayFree} />));
    await userEvent.click(screen.getByRole("button", { name: /Free Challenge/ }));
    expect(onPlayFree).toHaveBeenCalledTimes(2);
  });

  it("marks a free game's row Free, ranked like any other", () => {
    render(wrap(<LeaderboardScene {...LEADERBOARD.freeGame} />));
    const rows = within(screen.getByRole("list", { name: "Ranking" })).getAllByRole("button");
    expect(rows[1]).toHaveTextContent("Free");
    expect(rows.filter((r) => /Free/.test(r.textContent ?? ""))).toHaveLength(1);
  });
});

describe("SC3 stories", () => {
  // The SC1 scenes that gained states: their stories list the states of their mock object (the SC2 scenes are in scenes-2).
  const fixtures = { home: HOME, play: PLAY, purchase: PURCHASE };
  const names = { home: "HOME", play: "PLAY", purchase: "PURCHASE" } as const;
  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])("tells every state of %s in one story", (scene) => {
    const text = readFileSync(join(__dirname, `../src/components/scenes/${scene}-scene.stories.tsx`), "utf8");
    const stories = [...text.matchAll(/^export const (\w+): Story = \{ args: (\w+)\.(\w+) \};$/gm)];
    expect(stories.map((m) => m[3]).sort()).toEqual(Object.keys(fixtures[scene]).sort());
    expect(stories.every((m) => m[2] === names[scene])).toBe(true);
  });
});
