import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Cobbles, formatCobbles } from "../src/components/elements/cobbles";
import { CobblePacks, formatUsd } from "../src/components/containers/cobble-packs";
import { PLANS, applySkinChanges, isClaimed, packDiscount, referencePrice, toggleSkin } from "../src/components/containers/cobble-types";
import { SkinGrid } from "../src/components/containers/skin-grid";
import { AchievementsScene } from "../src/components/scenes/achievements-scene";
import { HomeScene } from "../src/components/scenes/home-scene";
import { LeaderboardScene } from "../src/components/scenes/leaderboard-scene";
import { PlayScene } from "../src/components/scenes/play-scene";
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import { QuestsScene } from "../src/components/scenes/quests-scene";
import { ThemeScene } from "../src/components/scenes/theme-scene";
import { ACHIEVEMENT_COBBLES, PACKS, PLAN_COUNTS, QUEST_COBBLES, SKIN_PRICES, activeOn, bits, ownedPlans, skinPrice } from "../src/mocks/cobbles";
import { QUEST_DEFINITIONS } from "../src/mocks/quests";
import { ACHIEVEMENTS, HOME, LEADERBOARD, PLAY, PURCHASE, QUESTS, THEME } from "../src/mocks/scenes";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

// The amounts are gems-v1.md's: a mismatch here is a mock that drifted from the design.
describe("Cobbles amounts (gems-v1.md)", () => {
  it("sells the owner's four tiers, each against the $0.20 reference (2.1)", () => {
    expect(PACKS.map((p) => [p.cobbles, formatUsd(p.price), formatUsd(referencePrice(p.cobbles)), packDiscount(p)])).toEqual([
      [50, "$5", "$10", 50],
      [100, "$9", "$20", 55],
      [500, "$40", "$100", 60],
      [1_000, "$70", "$200", 65],
    ]);
    expect(PACKS.map((p) => formatUsd(p.price / BigInt(p.cobbles), 2))).toEqual(["$0.10", "$0.09", "$0.08", "$0.07"]);
  });

  it("gives quests 5, 10 or 15 by their family's target, Daily Run 5 and a weekly 15 (3.1)", () => {
    expect(QUEST_COBBLES.map((q) => q.questId)).toEqual(QUEST_DEFINITIONS.map((d) => d.questId));
    expect(Object.fromEntries(QUEST_COBBLES.map((q) => [q.questId, q.cobbles]))).toEqual({ 1: 5, 5: 5, 6: 10, 7: 15, 8: 5, 9: 10, 10: 15, 11: 5, 12: 10, 13: 15, 14: 15, 15: 15, 16: 15 });
    expect(QUEST_COBBLES.filter((q) => q.kind === "weekly").map((q) => q.questId)).toEqual([14, 15, 16]);
  });

  it("gives an achievement its points, On the Podium none: 580 for the fifteen (3.1)", () => {
    expect(ACHIEVEMENT_COBBLES.map((a) => a.achievementId)).not.toContain(9);
    expect(ACHIEVEMENT_COBBLES).toHaveLength(15);
    expect(ACHIEVEMENT_COBBLES.reduce((sum, a) => sum + a.cobbles, 0)).toBe(580);
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

  it("writes a Cobble count with commas, its name for a screen reader", () => {
    expect(formatCobbles(1_580)).toBe("1,580");
    render(<Cobbles value={15} sign="+" />);
    expect(screen.getByRole("img", { name: "+15 Cobbles" })).toHaveTextContent("+15");
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

describe("Purchase: Cobbles", () => {
  it("shows the four packs, the reference struck through, and asks for a pick", () => {
    render(wrap(<PurchaseScene {...PURCHASE.cobblePacks} />));
    const packs = within(screen.getByRole("radiogroup", { name: "Cobble packs" })).getAllByRole("radio");
    expect(packs.map((p) => p.getAttribute("aria-label"))).toEqual(["50 Cobbles for $5, 50% off", "100 Cobbles for $9, 55% off", "500 Cobbles for $40, 60% off", "1000 Cobbles for $70, 65% off"]);
    expect(packs[1]).toHaveTextContent("instead of $20");
    expect(screen.getByRole("button", { name: "Pick a pack" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Cobbles", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "240 Cobbles" })).toBeInTheDocument();
  });

  it("confirms the pack picked, and selects another", async () => {
    const onBuyPack = vi.fn();
    const onSelectPack = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.cobblePackPicked} onBuyPack={onBuyPack} onSelectPack={onSelectPack} />));
    expect(screen.getByRole("radio", { name: /^100 Cobbles/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: /Pay \$9 for/ }));
    expect(onBuyPack).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("radio", { name: /^500 Cobbles/ }));
    expect(onSelectPack).toHaveBeenCalledWith(3);
  });

  it("names the referrer's share", () => {
    render(wrap(<PurchaseScene {...PURCHASE.cobblePackReferred} />));
    expect(screen.getByText(/Your referrer gets 5% of the price/)).toBeInTheDocument();
  });

  it("waits for the wallet while buying, the packs locked", () => {
    render(wrap(<PurchaseScene {...PURCHASE.cobblePackBuying} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toBeDisabled();
    expect(screen.getAllByRole("radio").every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });

  it("refuses a pack the wallet cannot pay", () => {
    render(wrap(<PurchaseScene {...PURCHASE.cobblePackShort} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough USDC");
    expect(screen.getByRole("button", { name: /Pay \$70/ })).toBeDisabled();
  });

  it("keeps the game's purchase on the Game tab", async () => {
    const onTab = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.cobblePacks} tab="game" onTab={onTab} />));
    expect(screen.getByRole("heading", { name: "Stake" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Cobbles" }));
    expect(onTab).toHaveBeenCalledWith("cobbles");
  });

  it("skips a pack of 0 Cobbles or at 0 USDC", () => {
    const packs = [...PACKS, { packId: 5, gems: 0, price: 1_000_000n, active: true }, { packId: 6, gems: 10, price: 0n, active: true }];
    render(wrap(<CobblePacks packs={packs} selected={null} />));
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("shows no tab without Cobbles", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("renders its stress state", () => {
    render(wrap(<PurchaseScene {...PURCHASE.cobbleStress} />));
    expect(screen.getByRole("img", { name: "987,654,321 Cobbles" })).toBeInTheDocument();
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
    expect(within(cell("ccccccccc")).getByRole("img", { name: "100 Cobbles" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("buys and switches a skin", async () => {
    const onBuySkin = vi.fn();
    const onToggleSkin = vi.fn();
    render(wrap(<ThemeScene {...THEME.skins} onBuySkin={onBuySkin} onToggleSkin={onToggleSkin} />));
    await userEvent.click(screen.getByRole("button", { name: "Buy Tile ccccccccc for 100 Cobbles" }));
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

  it("asks a player with no Cobbles to get some, every Buy disabled", async () => {
    const onBuyCobbles = vi.fn();
    render(wrap(<ThemeScene {...THEME.noCobbles} onBuyCobbles={onBuyCobbles} />));
    expect(screen.getByText("No Cobbles yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Buy / }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Get Cobbles" }));
    expect(onBuyCobbles).toHaveBeenCalledOnce();
  });

  it("disables what the player cannot afford, with the Cobbles missing", () => {
    render(wrap(<ThemeScene {...THEME.cantAfford} />));
    expect(within(cell("rfrfffffr")).getByRole("button", { name: /^Buy/ })).toBeEnabled();
    expect(within(cell("rfffrfffr")).getByRole("button", { name: /^Buy/ })).toBeEnabled();
    expect(within(cell("ccccccccc")).getByRole("button", { name: /^Buy/ })).toBeDisabled();
    expect(cell("ccccccccc")).toHaveTextContent("Need 40 more");
    expect(within(cell("ccccccccc")).getByRole("button", { name: /^Buy/ })).toHaveAccessibleDescription("Need 40 more");
    expect(within(cell("rfrfffffr")).getByRole("button", { name: /^Buy/ })).not.toHaveAttribute("aria-describedby");
  });

  it("shows a purchase on its way, the other skins waiting", () => {
    render(wrap(<ThemeScene {...THEME.buying} />));
    expect(within(cell("ccccccccc")).getByRole("button", { name: /^Buy/ })).toHaveAttribute("aria-busy", "true");
    expect(within(cell("cccccfffc")).getByRole("button", { name: /^Buy/ })).toBeDisabled();
  });

  it("keeps owned skins on a theme withdrawn from sale, the others not for sale", async () => {
    const onToggleSkin = vi.fn();
    render(wrap(<ThemeScene {...THEME.ownedUnpriced} onToggleSkin={onToggleSkin} />));
    expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Skins" })).getAllByRole("listitem")).toHaveLength(19);
    expect(cell("rfrfffffr")).toHaveAttribute("data-state", "active");
    expect(cell("ccccccccc")).toHaveTextContent("Not for sale");
    expect(screen.queryByRole("button", { name: /^Buy/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Tile ffffcccff skin active" }));
    expect(onToggleSkin).toHaveBeenCalledWith(7);
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
    // The balance is the header pill's (`Balances`), not the page's.
    expect(screen.getByRole("heading", { level: 1, name: "Theme" })).toBeInTheDocument();
  });
});

describe("Quests: Cobbles and free games", () => {
  it("shows each quest's cobbles, and the claimable one with Claim", async () => {
    const onClaim = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.cobblesToday} onClaim={onClaim} />));
    expect(within(screen.getByRole("article", { name: "Strong Day" })).getByRole("img", { name: "+10 Cobbles" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Strong Day" })).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Claim 5 Cobbles: Daily Run" }));
    expect(onClaim).toHaveBeenCalledWith(1);
    expect(screen.getByRole("region", { name: "Free games" })).toHaveTextContent("1 of 4 dailies done");
    expect(screen.getByRole("button", { name: "Claim the daily free game" })).toBeDisabled();
  });

  it("marks a claimed quest", () => {
    render(wrap(<QuestsScene {...QUESTS.cobblesClaimed} />));
    expect(within(screen.getByRole("article", { name: "Daily Run" })).getByText("Cobbles claimed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim all/ })).not.toBeInTheDocument();
  });

  it("keeps a past day claimable: Claim all and the day's free game", async () => {
    const onClaimAll = vi.fn();
    const onClaimCredit = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.cobblesPastDay} onClaimAll={onClaimAll} onClaimCredit={onClaimCredit} />));
    expect(screen.getByText("Closed day")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Claim all/ }));
    expect(onClaimAll).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /^Claim all/ })).toHaveTextContent("+20");
    await userEvent.click(screen.getByRole("button", { name: "Claim the daily free game" }));
    expect(onClaimCredit).toHaveBeenCalledWith("daily");
  });

  it("shows Claim all on its way, the other claims waiting", () => {
    render(wrap(<QuestsScene {...QUESTS.cobblesClaiming} />));
    expect(screen.getByRole("button", { name: /Claiming/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Claim the daily free game" })).toBeDisabled();
  });

  it("counts the free games and offers Play free", async () => {
    const onPlayFree = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.cobblesFreeGame} onPlayFree={onPlayFree} />));
    expect(screen.getByLabelText("1 free game left")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Claimed" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play free" }));
    expect(onPlayFree).toHaveBeenCalledOnce();
  });

  it("offers the week's free game once its three are done", () => {
    render(wrap(<QuestsScene {...QUESTS.cobblesWeekDone} />));
    expect(screen.getByRole("button", { name: "Claim the weekly free game" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Claim all/ })).toHaveTextContent("+45");
  });
});

describe("Achievements: Cobbles", () => {
  it("shows each one's cobbles, claimed and claimable, and none for On the Podium", async () => {
    const onClaim = vi.fn();
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.cobbles} onClaim={onClaim} />));
    expect(within(screen.getByRole("article", { name: "First Stone" })).getByText("Cobbles claimed")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "On the Podium" })).queryByRole("img", { name: /Cobbles/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Claim 20 Cobbles: Settler II/ }));
    expect(onClaim).toHaveBeenCalledWith(3);
    expect(screen.getByRole("button", { name: /^Claim all/ })).toHaveTextContent("+40");
  });

  it("shows Claim all on its way", () => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.cobblesClaiming} />));
    expect(screen.getAllByRole("button", { name: /Claiming|Claim/ }).some((b) => b.getAttribute("aria-busy") === "true")).toBe(true);
  });

  it("has nothing left to claim when all are claimed", () => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.cobblesAllClaimed} />));
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Cobbles claimed")).toHaveLength(15);
  });
});

describe("Home, Play and Leaderboard: Cobbles", () => {
  it("keeps the free-game card on Home, with no day or Daily wording", () => {
    render(wrap(<HomeScene {...HOME.cobbles} />));
    expect(screen.queryByText(/^Day \d+/)).not.toBeInTheDocument();
    expect(screen.queryByText("Daily")).not.toBeInTheDocument();
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

  it("marks a free game in Home's top 3, as the Leaderboard does", () => {
    render(wrap(<HomeScene {...HOME.freeGame} />));
    const podium = within(screen.getByRole("list", { name: "Top 3" })).getAllByRole("listitem");
    expect(podium[1]).toHaveTextContent("Free");
    expect(podium.filter((r) => /Free/.test(r.textContent ?? ""))).toHaveLength(1);
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
