import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Cobbles, formatCobbles } from "../src/components/elements/cobbles";
import { CobblePacks, formatUsd } from "../src/components/containers/cobble-packs";
import { PLANS, applySkinChanges, chooseTheme, isClaimed, packDiscount, pickSkin, referencePrice, themeInUse, themeSet } from "../src/components/containers/cobble-types";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { PlayScene } from "../src/components/scenes/play-scene";
import { CobblesScene } from "../src/components/scenes/cobbles-scene";
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import { MissionsScene } from "../src/components/scenes/missions-scene";
import { ThemeShopScene } from "../src/components/scenes/theme-shop-scene";
import { MyTilesScene } from "../src/components/scenes/my-tiles-scene";
import { ACHIEVEMENT_COBBLES, PACKS, PLAN_COUNTS, QUEST_COBBLES, SKIN_PRICES, activeOn, bits, ownedPlans, skinPrice } from "../src/mocks/cobbles";
import { DAILY_QUESTS, WEEKLY_QUESTS } from "@paved/game-core";
import { QUEST_DEFINITIONS, QUESTS_ALL_DONE, QUESTS_TODAY, QUESTS_TODAY_ALL_DONE, questsTodayDone } from "../src/mocks/quests";
import { TODAY } from "../src/mocks/players";
import { isLiveOnDay, questPeriod } from "../src/lib/quest-window";
import { COBBLES, MISSIONS, MY_TILES, PLAY, PURCHASE, THEME_SHOP } from "../src/mocks/scenes";

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

  it("gives a Challenge weekly 15 (3.1), a PvP weekly and a daily none: the period's milestones pay (#869, #976)", () => {
    expect(QUEST_COBBLES.map((q) => q.questId)).toEqual(QUEST_DEFINITIONS.map((d) => d.questId));
    expect(Object.fromEntries(QUEST_COBBLES.map((q) => [q.questId, q.cobbles]))).toEqual({
      1: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 15, 15: 15, 16: 15, 17: 0, 18: 0, 19: 0, 20: 0, 21: 0,
    });
    expect(QUEST_COBBLES.filter((q) => q.kind === "weekly").map((q) => q.questId)).toEqual([14, 15, 16, 20, 21]);
  });

  it("lives five weeklies a week (#976): the three Challenge ones, Weekly Raider and Weekly Stars", () => {
    for (const day of [TODAY - 7, TODAY, TODAY + 7]) {
      const live = QUEST_DEFINITIONS.filter((d) => questPeriod(d) === "weekly" && isLiveOnDay(d, day));
      expect(live.map((d) => d.questId)).toEqual([14, 15, 16, 20, 21]);
      expect(live).toHaveLength(WEEKLY_QUESTS);
    }
    expect(QUEST_DEFINITIONS.filter((d) => d.questId >= 20).map((d) => [d.questId, d.taskId, d.total])).toEqual([
      [20, 19, 10],
      [21, 20, 15],
    ]);
  });

  it("lives five dailies a day (#869): Daily Run and one of each of the four rotating families", () => {
    for (const day of [TODAY - 1, TODAY, TODAY + 1]) {
      const live = QUEST_DEFINITIONS.filter((d) => questPeriod(d) === "daily" && isLiveOnDay(d, day));
      expect(live).toHaveLength(DAILY_QUESTS);
      expect(new Set(live.map((d) => d.taskId)).size).toBe(4);
    }
    const dailies = (q: typeof QUESTS_TODAY) => q.quests.filter((x) => questPeriod(x) === "daily");
    expect(dailies(QUESTS_TODAY).map((q) => q.questId)).toEqual([1, 6, 9, 12, 18]);
    expect(dailies(QUESTS_TODAY_ALL_DONE).every((q) => q.completed)).toBe(true);
    expect(dailies(QUESTS_ALL_DONE).every((q) => q.completed)).toBe(true);
    for (const done of [0, 1, 2, 3, 4, 5]) expect(dailies(questsTodayDone(done)).filter((q) => q.completed)).toHaveLength(done);
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

describe("skin choices (5.3, THEMES-RENDERS)", () => {
  const saved = activeOn(1, 10, 13);
  const owned = { 1: ownedPlans(7, 8, 10, 13) };

  it("picks a plan's skin, and leaves the batch when back to the saved one", () => {
    const on = pickSkin(saved, {}, 7, 1);
    expect(on).toEqual({ 7: 1 });
    expect(pickSkin(saved, on, 7, 0)).toEqual({});
    expect(pickSkin(saved, {}, 10, 0)).toEqual({ 10: 0 });
    expect(applySkinChanges(saved, { 10: 0 })[9]).toBe(0);
  });

  it("a theme chosen whole: every owned plan wears it, the others Default; Default is every plan on 0", () => {
    expect(themeSet(owned, 1).flatMap((t, i) => (t === 1 ? [i + 1] : []))).toEqual([7, 8, 10, 13]);
    expect(themeSet(owned, 0).every((t) => t === 0)).toBe(true);
    expect(themeSet({}, 1).every((t) => t === 0)).toBe(true);
  });

  it("is in use when the active set is what choosing it gives, and owned", () => {
    expect(themeInUse(activeOn(1, 7, 8, 10, 13), owned, 1)).toBe(true);
    expect(themeInUse(saved, owned, 1)).toBe(false);
    expect(themeInUse(saved, owned, 0)).toBe(false);
    expect(themeInUse(activeOn(1), owned, 0)).toBe(true);
    // Nothing owned in Forest: Default is in use, not Forest.
    expect(themeInUse(activeOn(1), { 1: 0 }, 1)).toBe(false);
  });

  it("choosing a theme sends only the plans that change, and asks first over a tile-by-tile mix", () => {
    expect(chooseTheme(saved, owned, 1)).toEqual({ changes: { 7: 1, 8: 1 }, overridesChoice: true });
    expect(chooseTheme(saved, owned, 0)).toEqual({ changes: { 10: 0, 13: 0 }, overridesChoice: true });
    // From Default whole to Forest whole, and back: no choice is lost, nothing asked.
    expect(chooseTheme(activeOn(1), owned, 1)).toEqual({ changes: { 7: 1, 8: 1, 10: 1, 13: 1 }, overridesChoice: false });
    expect(chooseTheme(activeOn(1, 7, 8, 10, 13), owned, 0).overridesChoice).toBe(false);
    expect(chooseTheme(activeOn(1, 7, 8, 10, 13), owned, 1)).toEqual({ changes: {}, overridesChoice: false });
  });
});

describe("Cobble packs (#621: their own page)", () => {
  it("shows the four packs, the reference struck through, and asks for a pick", () => {
    render(wrap(<CobblesScene {...COBBLES.packs} />));
    const packs = within(screen.getByRole("radiogroup", { name: "Cobble packs" })).getAllByRole("radio");
    expect(packs.map((p) => p.getAttribute("aria-label"))).toEqual(["50 Cobbles for $5, 50% off", "100 Cobbles for $9, 55% off", "500 Cobbles for $40, 60% off", "1000 Cobbles for $70, 65% off"]);
    expect(packs[1]).toHaveTextContent("instead of $20");
    expect(screen.getByRole("button", { name: "Pick a pack" })).toBeDisabled();
    expect(screen.getByRole("heading", { level: 1, name: "Cobbles" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Your Cobbles" })).getByRole("img", { name: "240 Cobbles" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("confirms the pack picked, and selects another", async () => {
    const onBuyPack = vi.fn();
    const onSelectPack = vi.fn();
    render(wrap(<CobblesScene {...COBBLES.picked} onBuyPack={onBuyPack} onSelectPack={onSelectPack} />));
    expect(screen.getByRole("radio", { name: /^100 Cobbles/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: /Pay \$9 for/ }));
    expect(onBuyPack).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("radio", { name: /^500 Cobbles/ }));
    expect(onSelectPack).toHaveBeenCalledWith(3);
  });

  it("names the referrer's share", () => {
    render(wrap(<CobblesScene {...COBBLES.referred} />));
    expect(screen.getByText(/Your referrer gets 5% of the price/)).toBeInTheDocument();
  });

  it("waits for the wallet while buying, the packs locked", () => {
    render(wrap(<CobblesScene {...COBBLES.buying} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toBeDisabled();
    expect(screen.getAllByRole("radio").every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });

  it("refuses a pack the wallet cannot pay", () => {
    render(wrap(<CobblesScene {...COBBLES.short} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough USDC");
    expect(screen.getByRole("button", { name: /Pay \$70/ })).toBeDisabled();
  });

  it("shows a guest's Cobbles as a dash, and Pay connects", () => {
    render(wrap(<CobblesScene {...COBBLES.picked} balance={null} connected={false} />));
    expect(within(screen.getByRole("region", { name: "Your Cobbles" })).getByText("–")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect to buy" })).toBeEnabled();
  });

  it("skips a pack of 0 Cobbles or at 0 USDC", () => {
    const packs = [...PACKS, { packId: 5, gems: 0, price: 1_000_000n, active: true }, { packId: 6, gems: 10, price: 0n, active: true }];
    render(wrap(<CobblePacks packs={packs} selected={null} />));
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("leaves the Challenge's purchase to the game alone: no tab, no pack", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    expect(screen.getByRole("heading", { level: 1, name: "Challenge" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Cobble packs" })).not.toBeInTheDocument();
  });

  it("renders its stress state", () => {
    render(wrap(<CobblesScene {...COBBLES.stress} />));
    expect(screen.getByRole("img", { name: "987,654,321 Cobbles" })).toBeInTheDocument();
  });
});

describe("Theme shop", () => {
  const cell = (plan: number) => screen.getByRole("listitem", { name: `Tile ${plan}` });

  it("draws the 19 tiles as rendered, with their price, state and variants, and counts the owned ones", () => {
    render(wrap(<ThemeShopScene {...THEME_SHOP.forest} />));
    const grid = screen.getByRole("list", { name: "Tiles" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(19);
    expect(screen.getByText("of").parentElement).toHaveTextContent("4 of 19 tiles owned");
    expect(cell(13)).toHaveAttribute("data-state", "active");
    expect(cell(7)).toHaveAttribute("data-state", "owned");
    expect(cell(1)).toHaveAttribute("data-state", "none");
    expect(within(cell(1)).getByRole("img", { name: "100 Cobbles" })).toBeInTheDocument();
    // The real render of the plan in Forest, never a tinted chip.
    expect(within(cell(1)).getByRole("img", { name: "Tile 1" })).toHaveAttribute("src", expect.stringMatching(/\/renders\/ccccccccc\.1\.[0-9a-f]{10}\.webp$/));
    expect(within(cell(13)).getByLabelText(/^\d variants: the board picks one per tile$/)).toBeInTheDocument();
    expect(screen.getByText(/models: the board picks one per tile/).textContent).toBe("72 models: the board picks one per tile");
  });

  it("buys a tile, and goes to My tiles", async () => {
    const onBuy = vi.fn();
    const onMyTiles = vi.fn();
    render(wrap(<ThemeShopScene {...THEME_SHOP.forest} onBuy={onBuy} onMyTiles={onMyTiles} />));
    await userEvent.click(screen.getByRole("button", { name: "Buy Tile 1 for 100 Cobbles" }));
    expect(onBuy).toHaveBeenCalledWith(1);
    expect(within(cell(7)).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /My tiles/ }));
    expect(onMyTiles).toHaveBeenCalledOnce();
  });

  it("asks a player with no Cobbles to get some, every Buy disabled", async () => {
    const onBuyCobbles = vi.fn();
    render(wrap(<ThemeShopScene {...THEME_SHOP.noCobbles} onBuyCobbles={onBuyCobbles} />));
    expect(screen.getByText("No Cobbles yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Buy / }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Get Cobbles" }));
    expect(onBuyCobbles).toHaveBeenCalledOnce();
  });

  it("disables what the player cannot afford, with the Cobbles missing", () => {
    render(wrap(<ThemeShopScene {...THEME_SHOP.cantAfford} />));
    expect(within(cell(13)).getByRole("button", { name: /^Buy/ })).toBeEnabled();
    expect(within(cell(10)).getByRole("button", { name: /^Buy/ })).toBeEnabled();
    expect(within(cell(1)).getByRole("button", { name: /^Buy/ })).toBeDisabled();
    expect(cell(1)).toHaveTextContent("Need 40 more");
    expect(within(cell(1)).getByRole("button", { name: /^Buy/ })).toHaveAccessibleDescription("Need 40 more");
    expect(within(cell(13)).getByRole("button", { name: /^Buy/ })).not.toHaveAttribute("aria-describedby");
  });

  it("shows a purchase on its way, the other tiles waiting", () => {
    render(wrap(<ThemeShopScene {...THEME_SHOP.buying} />));
    expect(within(cell(1)).getByRole("button", { name: /^Buy/ })).toHaveAttribute("aria-busy", "true");
    expect(within(cell(2)).getByRole("button", { name: /^Buy/ })).toBeDisabled();
  });

  it("keeps owned tiles on a theme withdrawn from sale, the others not for sale", () => {
    render(wrap(<ThemeShopScene {...THEME_SHOP.ownedUnpriced} />));
    expect(screen.queryByText(/coming soon/)).not.toBeInTheDocument();
    expect(cell(13)).toHaveAttribute("data-state", "active");
    expect(cell(1)).toHaveTextContent("Not for sale");
    expect(screen.queryByRole("button", { name: /^Buy/ })).not.toBeInTheDocument();
  });

  it("says a theme not out yet is coming soon, its cover blurred", () => {
    const { container } = render(wrap(<ThemeShopScene {...THEME_SHOP.comingSoon} />));
    expect(screen.getByText("Snow tiles: coming soon")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tiles" })).not.toBeInTheDocument();
    expect(container.querySelector("img.blur-xl")).toHaveAttribute("aria-hidden", "true");
  });

  it("asks a guest to connect, and shows a failed read with Retry", async () => {
    const onConnect = vi.fn();
    const { unmount } = render(wrap(<ThemeShopScene {...THEME_SHOP.guest} onConnect={onConnect} />));
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
    unmount();
    render(wrap(<ThemeShopScene {...THEME_SHOP.error} />));
    expect(screen.getByText("The skins could not be read")).toBeInTheDocument();
  });

  it("renders its stress state", () => {
    render(wrap(<ThemeShopScene {...THEME_SHOP.stress} />));
    // The balance is the header pill's (`Balances`), not the page's.
    expect(screen.getByRole("heading", { level: 1, name: "Forest" })).toBeInTheDocument();
  });
});

describe("My tiles", () => {
  const row = (plan: number) => screen.getByRole("listitem", { name: `Tile ${plan}` });

  it("offers each owned tile Default and the themes it is owned in, the active one picked; the others on Default, together", () => {
    render(wrap(<MyTilesScene {...MY_TILES.owned} />));
    expect(within(screen.getByRole("list", { name: "Tiles" })).getAllByRole("listitem")).toHaveLength(4);
    expect(within(screen.getByRole("list", { name: "Default only" })).getAllByRole("listitem")).toHaveLength(15);
    expect(within(row(13)).getByRole("radio", { name: "Tile 13: Forest" })).toHaveAttribute("aria-checked", "true");
    expect(within(row(7)).getByRole("radio", { name: "Tile 7: Default" })).toHaveAttribute("aria-checked", "true");
    expect(within(row(1)).queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("picks one tile's skin", async () => {
    const onPick = vi.fn();
    render(wrap(<MyTilesScene {...MY_TILES.owned} onPick={onPick} />));
    await userEvent.click(within(row(7)).getByRole("radio", { name: "Tile 7: Forest" }));
    expect(onPick).toHaveBeenCalledWith(7, 1);
  });

  it("batches the picks and saves them in one write", async () => {
    const onSave = vi.fn();
    render(wrap(<MyTilesScene {...MY_TILES.changed} onSave={onSave} />));
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(bar).toHaveTextContent("2 changes to save");
    expect(row(7)).toHaveAttribute("data-changed", "true");
    expect(within(row(13)).getByRole("radio", { name: "Tile 13: Default" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(bar).getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("locks the picks while saving, then says saved", () => {
    const { unmount } = render(wrap(<MyTilesScene {...MY_TILES.saving} />));
    expect(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(screen.getAllByRole("radio").every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
    unmount();
    render(wrap(<MyTilesScene {...MY_TILES.saved} />));
    expect(screen.getByRole("status")).toHaveTextContent("Tiles saved");
  });

  it("with no skin owned, every tile is on Default and the shop is a tap away", async () => {
    const onOpenShop = vi.fn();
    render(wrap(<MyTilesScene {...MY_TILES.none} onOpenShop={onOpenShop} />));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Default only" })).getAllByRole("listitem")).toHaveLength(19);
    await userEvent.click(screen.getByRole("button", { name: "Open the Forest shop" }));
    expect(onOpenShop).toHaveBeenCalledWith("forest");
  });
});

describe("Missions: Cobbles only (#832)", () => {
  const card = () => within(screen.getByRole("region", { name: "Selected mission" }));
  const select = (name: RegExp) => userEvent.click(screen.getByRole("button", { name }));

  it("shows each mission's Cobbles under its icon, none for a daily (#869), and claims a quest from its card", async () => {
    const onClaimQuest = vi.fn();
    render(wrap(<MissionsScene {...MISSIONS.weekBonus} onClaimQuest={onClaimQuest} />));
    expect(within(screen.getByRole("button", { name: /^Strong Day/ })).queryByRole("img", { name: /Cobbles/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^Weekly Forester/ })).getByRole("img", { name: "+15 Cobbles" })).toBeInTheDocument();
    // A mission not done: its card has no Claim, a short line instead.
    await select(/^Strong Day/);
    expect(card().queryByRole("button")).not.toBeInTheDocument();
    expect(card().getByText(/Play today: it resets/)).toBeInTheDocument();
    // A daily done: nothing to claim on its own.
    await select(/^Daily Run/);
    expect(card().queryByRole("button")).not.toBeInTheDocument();
    await select(/^Weekly Forester/);
    await userEvent.click(card().getByRole("button", { name: "Claim 15 Cobbles: Weekly Forester" }));
    expect(onClaimQuest).toHaveBeenCalledWith(14);
  });

  it("claims an achievement and a period's bonus from the card; On the Podium gives none", async () => {
    const onClaimAchievement = vi.fn();
    const onClaimBonus = vi.fn();
    render(wrap(<MissionsScene {...MISSIONS.weekBonus} onClaimAchievement={onClaimAchievement} onClaimBonus={onClaimBonus} />));
    await userEvent.click(card().getByRole("button", { name: "Claim 60 Cobbles: Weekly bonus" }));
    expect(onClaimBonus).toHaveBeenCalledWith("weekly");
    await select(/^Settler II:/);
    await userEvent.click(card().getByRole("button", { name: "Claim 20 Cobbles: Settler II" }));
    expect(onClaimAchievement).toHaveBeenCalledWith(3);
    await select(/^First Stone/);
    expect(card().getByText("Cobbles claimed")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^On the Podium/ })).queryByRole("img", { name: /Cobbles/ })).not.toBeInTheDocument();
  });

  it("shows a claim on its way, the others waiting", async () => {
    render(wrap(<MissionsScene {...MISSIONS.claiming} />));
    expect(card().getByRole("button", { name: "Claim 20 Cobbles: Settler II" })).toHaveAttribute("aria-busy", "true");
    await select(/^Grand Builder:/);
    expect(card().getByRole("button", { name: "Claim 20 Cobbles: Grand Builder" })).toBeDisabled();
  });

  it("has nothing left to claim when all are claimed, the week's bonus too; the day has none (#869)", () => {
    render(wrap(<MissionsScene {...MISSIONS.allDone} />));
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Cobbles to claim$/ })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Daily bonus/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weekly bonus: Done" })).toBeInTheDocument();
  });

  it("read only: the card says Connect to claim", () => {
    render(wrap(<MissionsScene {...MISSIONS.readOnly} />));
    expect(card().getByText("Connect to claim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Claim/ })).not.toBeInTheDocument();
  });

  it("without the ledger: the missions without Cobbles, and why", () => {
    render(wrap(<MissionsScene {...MISSIONS.noRewards} />));
    expect(screen.getByText("Rewards unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Cobbles/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bonus/ })).not.toBeInTheDocument();
  });
});

describe("Home and Play: Cobbles", () => {
  it("leaves the free game to Play: the home's village has no free-game card (#753)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />));
    expect(screen.queryByText("Daily")).not.toBeInTheDocument();
    expect(screen.queryByText(/Free game/)).not.toBeInTheDocument();
    // The lazy League control (and its standing reads, #917) loads before the test ends, not after the environment's teardown.
    expect(await screen.findByRole("button", { name: /^League:/ })).toBeInTheDocument();
  });

  it("offers a free game on Play that spends a credit", async () => {
    const onPlayFree = vi.fn();
    render(wrap(<PlayScene {...PLAY.freeGame} onPlayFree={onPlayFree} />));
    await userEvent.click(screen.getByRole("button", { name: /Free Challenge/ }));
    expect(onPlayFree).toHaveBeenCalledTimes(1);
  });
});

describe("SC3 stories", () => {
  // The SC1 scenes that gained states: their stories list the states of their mock object (the SC2 scenes are in scenes-2).
  const fixtures = { play: PLAY, purchase: PURCHASE, cobbles: COBBLES };
  const names = { play: "PLAY", purchase: "PURCHASE", cobbles: "COBBLES" } as const;
  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])("tells every state of %s in one story", (scene) => {
    const text = readFileSync(join(__dirname, `../src/components/scenes/${scene}-scene.stories.tsx`), "utf8");
    const stories = [...text.matchAll(/^export const (\w+): Story = \{ args: (\w+)\.(\w+) \};$/gm)];
    expect(stories.map((m) => m[3]).sort()).toEqual(Object.keys(fixtures[scene]).sort());
    expect(stories.every((m) => m[2] === names[scene])).toBe(true);
  });
});
