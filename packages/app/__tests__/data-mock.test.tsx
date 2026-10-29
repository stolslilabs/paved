import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AvatarRefusedError,
  ClaimRefusedError,
  ViewError,
  PavedWriter,
  SkinRefusedError,
  VillageRefusedError,
  WriteError,
  type DecodedEvent,
  type FakeGameViews,
  type PackPurchaseRequest,
  type WriteResult,
} from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_HEAD, FakeClaimer, type FakeEconomy } from "@paved/chain/testing";
import type { DataSources, GameSigner } from "../src/data";
import { useAchievementRewards, useClaims, useCobbleAccount, useQuestRewards } from "../src/data";
import { usePavedBalance, useUsdcBalance, useVaultPosition } from "../src/data/chain";
import { dataSourceOf, MOCKED_PAGES } from "../src/data/data-source";
import { MOCK_KEY, MOCK_SPLIT, MOCK_STARTING_PAVED, MOCK_VAULT, MockLedger, mockLock } from "../src/data/mock/ledger";
import { usePlayerProgress } from "../src/data/player-progress";
import { FREE_SPAWN_MOCKED, GAME_FELTS_BEFORE_EXPIRY, initialSeedOf, mockGameViews, mockSigner } from "../src/data/mock/overlay";
import { DAILY_MILESTONES, DAILY_QUESTS, poseidon } from "@paved/game-core";
import { usePlayerQuests } from "../src/data/indexer";
import { DailyMilestoneRefusedError, type DailyMilestoneViews, type DailyMilestoneWrites } from "../src/data/daily-milestones";
import { questPeriod, weekOfDay } from "../src/lib/quest-window";
import { GAME_PLAYING } from "../src/mocks/games";
import { useBuyPack, usePacks } from "../src/data/purchase";
import { referralKey, useReferralEarnings } from "../src/data/referral";
import { useSkinWrites, useThemeSkins } from "../src/data/skins";
import { useVaultWrites } from "../src/data/vault";
import type { Purchases, VaultWrites } from "../src/data/sources";
import { PACKS, SKIN_PRICES } from "../src/mocks/cobbles";
import { PAGES } from "../src/routes/pages";
import { dataOf, fakeSources, memoryStore, renderData } from "./data-fakes";
import { mockImplementation, playDailies, surrenderGame } from "./mock-fakes";
import { FakeSkinWriter } from "./skin-fakes";
import { FakeAvatarWriter } from "./avatar-fakes";
import { DEFAULT_AVATAR, encodeAvatar } from "@paved/renderer";
import { savedLook, useAvatar } from "../src/data/avatar";
import { useAvatarCatalogue, useAvatarWrites } from "../src/data/avatar-catalogue";
import { AVATAR_ITEMS, AVATAR_PARTS_IN_USE, AVATAR_PRICE_BOUNDS } from "../src/mocks/avatar";
import { FakeVillageWriter } from "./village-fakes";
import { MOCK_SKIN_TIERS, MOCK_STARTING_REWARDS } from "../src/data/mock/ledger";
import { useVillage, useVillageReward, useVillageWrites } from "../src/data/village";
import { legalCells } from "../src/components/containers/village-rules";

// The mock data layer (#549, MOCK-FIRST): the same hooks, through the same `DataSources`, on the two implementations of the
// reads and writes the Sepolia classes lack. `chain`: `@paved/chain`'s fakes of the chain path (`FakeGameViews`,
// `FakeEconomy`, `FakeClaimer`, the skins' writer) with the contracts' rules. `mock`: the mock ledger's overlays
// (`data/mock/overlay.ts`) over a chain whose Setup, Vault and indexer predate cobbles v1, as Sepolia's do. Each flow
// completes on both and moves the same balances.

const PLAYER = FIXTURE_ADA;
const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);
const P = 10n ** 18n;
const USDC = 1_000_000n;

/** The chain path's pack buyer and Vault writes for the test, on the fakes, with the receipts' events the contracts emit. */
function chainWrites(views: FakeGameViews, economy: FakeEconomy) {
  let transactions = 0;
  const receipt = (events: DecodedEvent[]): WriteResult => ({ transactionHash: `0xfe${++transactions}`, events });
  const purchases: Purchases = {
    purchase: () => Promise.reject(new WriteError("not in this test")),
    referrer: async () => null,
    receipt: async () => "succeeded",
    buyPack: async (request: PackPurchaseRequest) => {
      const pack = await views.pack(request.packId);
      const usdc = await economy.usdcBalance(PLAYER);
      if (usdc < pack.price) throw new WriteError("Not enough USDC");
      economy.setBalance("usdc", PLAYER, usdc - pack.price);
      const player = views.cobblePlayer(PLAYER);
      player.account = { ...player.account, cobbles: player.account.cobbles + pack.cobbles };
      const bought = { playerId: PLAYER, packId: pack.packId, cobbles: pack.cobbles, price: pack.price, referrer: "0x0", balance: player.account.cobbles };
      return { ...receipt([{ name: "PackBought", fields: bought, fromAddress: "0x3" }]), bought };
    },
  };
  const vault: VaultWrites = {
    deposit: async (amount) => {
      const shares = await economy.previewDeposit(amount);
      economy.setBalance("paved", PLAYER, (await economy.pavedBalance(PLAYER)) - amount);
      economy.vaultAssets += amount;
      economy.vaultSupply += shares;
      economy.shares.set(BigInt(PLAYER).toString(16), ((await economy.vault(PLAYER)).shares ?? 0n) + shares);
      return receipt([{ name: "Deposit", fields: { sender: PLAYER, owner: PLAYER, assets: amount, shares }, fromAddress: "0x12" }]);
    },
    withdraw: () => Promise.reject(new WriteError("not in this test")),
    withdrawAll: async () => {
      const { shares, maxWithdraw } = await economy.vault(PLAYER);
      economy.setBalance("paved", PLAYER, (await economy.pavedBalance(PLAYER)) + maxWithdraw);
      economy.vaultAssets -= maxWithdraw;
      economy.vaultSupply -= shares;
      economy.shares.set(BigInt(PLAYER).toString(16), 0n);
      return receipt([{ name: "Withdraw", fields: { sender: PLAYER, receiver: PLAYER, owner: PLAYER, assets: maxWithdraw, shares }, fromAddress: "0x12" }]);
    },
  };
  return { purchases, vault };
}

/** The chain path: the fresh deployment's figures on the fakes (the packs, Forest's prices, the Vault, the split). */
function chainImplementation() {
  const f = fakeSources();
  const { views, economy, fixture } = f;
  for (const q of fixture.quests) views.questRates.set(Number(q.quest_id), { questId: Number(q.quest_id), cobbles: Number(q.cobbles), kind: "daily", task: 1, total: 1, start: 0, interval: 86_400 });
  views.achievementRates.set(2, { achievementId: 2, cobbles: 10, task: 1, total: 1 });
  const ada = views.cobblePlayer(PLAYER);
  ada.account = { ...ada.account, games: 1 };
  ada.days.set(TODAY, { games: 1, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false });
  for (const p of PACKS) views.packs.set(p.packId, { ...p });
  views.priceSkins(1, SKIN_PRICES);
  views.avatars.parts = AVATAR_PARTS_IN_USE;
  views.avatars.bounds = [...AVATAR_PRICE_BOUNDS];
  for (const item of AVATAR_ITEMS.flat()) views.listAvatarItem(item);
  economy.split_ = { ...MOCK_SPLIT };
  economy.vaultAssets = MOCK_VAULT.assets;
  economy.vaultSupply = MOCK_VAULT.supply;
  economy.setBalance("paved", PLAYER, MOCK_STARTING_PAVED);
  economy.setBalance("usdc", PLAYER, 100n * USDC);
  const claimer = new FakeClaimer(views, PLAYER);
  const skins = new FakeSkinWriter(views, PLAYER);
  const avatar = new FakeAvatarWriter(views, PLAYER);
  const village = new FakeVillageWriter(views, PLAYER);
  views.villagePlayer(PLAYER).grants = { day: TODAY, today: 0, pending: MOCK_STARTING_REWARDS, opened: 0 };
  for (const [theme, tiers] of MOCK_SKIN_TIERS) for (const [plan, tier] of Object.entries(tiers)) views.skinTierTable.set(`${theme}:${plan}`, tier);
  const signer = {
    address: PLAYER,
    claim: claimer.claim.bind(claimer),
    claimQuest: claimer.claimQuest.bind(claimer),
    claimAchievement: claimer.claimAchievement.bind(claimer),
    claimDailyCredit: claimer.claimDailyCredit.bind(claimer),
    claimWeeklyCredit: claimer.claimWeeklyCredit.bind(claimer),
    buySkin: skins.buySkin.bind(skins),
    setSkins: skins.setSkins.bind(skins),
    buyAvatarItem: avatar.buyAvatarItem.bind(avatar),
    setAvatar: avatar.setAvatar.bind(avatar),
    foundVillage: village.foundVillage.bind(village),
    buyParcel: village.buyParcel.bind(village),
    openReward: village.openReward.bind(village),
    claimReward: village.claimReward.bind(village),
  } as unknown as GameSigner;
  const writes = chainWrites(views, economy);
  const sources: DataSources = { ...f.sources, signer, purchases: () => writes.purchases, vault: () => writes.vault };
  return { sources };
}

const IMPLEMENTATIONS = [
  ["chain", () => chainImplementation().sources],
  ["mock", () => mockImplementation().sources],
] as const;

describe.each(IMPLEMENTATIONS)("the shared interface on the %s implementation", (_name, make) => {
  it("an achievement's claim adds its Cobbles", async () => {
    const sources = make();
    const { result } = renderData(() => ({ rewards: useAchievementRewards(PLAYER), claims: useClaims(PLAYER) }), sources);
    await waitFor(() => expect(result.current.rewards.data).toBeTruthy());
    await act(() => result.current.claims.claim("achievement:2", [{ kind: "achievement", achievementId: 2 }]));
    await waitFor(() => expect(result.current.rewards.data?.balance).toBe(10));
    expect(result.current.rewards.data!.claimed & (1n << 2n)).toBe(1n << 2n);
  });

  it("a pack bought with USDC adds its Cobbles and takes its price", async () => {
    const sources = make();
    const { result } = renderData(() => ({ packs: usePacks(), buy: useBuyPack(PLAYER), account: useCobbleAccount(PLAYER), usdc: useUsdcBalance(PLAYER) }), sources);
    await waitFor(() => expect(result.current.packs.data).toEqual(PACKS));
    await waitFor(() => expect(result.current.usdc.data).toBe(100n * USDC));
    await act(() => result.current.buy.mutation.mutateAsync({ playerId: PLAYER, packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null }));
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(50));
    await waitFor(() => expect(result.current.usdc.data).toBe(95n * USDC));
  });

  it("a skin bought with Cobbles is owned, then set active; one beyond the balance is refused", async () => {
    const sources = make();
    const { result } = renderData(() => ({ skins: useThemeSkins(PLAYER, 1), writes: useSkinWrites(PLAYER), buy: useBuyPack(PLAYER) }), sources);
    await waitFor(() => expect(result.current.skins.data?.prices).toEqual(SKIN_PRICES));
    await act(() => result.current.buy.mutation.mutateAsync({ playerId: PLAYER, packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null }));
    await waitFor(() => expect(result.current.skins.data?.balance).toBe(50));
    // Plan 13 costs 50 in Forest (the rarity table), plan 1 costs 100.
    const short = await result.current.writes.buy(1, 1, 100).catch((e: unknown) => e);
    expect(short).toBeInstanceOf(SkinRefusedError);
    expect((short as SkinRefusedError).reason).toBe("not-enough-cobbles");
    await act(() => result.current.writes.buy(1, 13, 50));
    await waitFor(() => expect(result.current.skins.data?.balance).toBe(0));
    expect(result.current.skins.data!.owned & (1 << 13)).toBe(1 << 13);
    await act(() => result.current.writes.save([{ plan: 13, theme: 1 }]));
    await waitFor(() => expect(result.current.skins.data?.active[12]).toBe(1));
    expect(result.current.writes.saved).toBe(true);
  });

  it("an avatar item bought with Cobbles is owned; the avatar saved with it is the menus' (#626)", async () => {
    const sources = make();
    const { result } = renderData(() => ({ catalogue: useAvatarCatalogue(PLAYER), writes: useAvatarWrites(PLAYER), avatar: useAvatar(PLAYER), buy: useBuyPack(PLAYER) }), sources);
    await waitFor(() => expect(result.current.catalogue.data?.parts).toBe(AVATAR_PARTS_IN_USE));
    expect(result.current.catalogue.data!.items[7]![6]).toMatchObject({ state: 1, cobbles: 60 });
    expect(result.current.avatar.data).toEqual({ look: 0n, ids: null });
    await act(() => result.current.buy.mutation.mutateAsync({ playerId: PLAYER, packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null }));
    await waitFor(() => expect(result.current.catalogue.data?.balance).toBe(50));
    // The Crown (headwear 6) costs 60: refused, nothing spent; the Helmet (headwear 4) costs 20.
    const short = await result.current.writes.buy(7, 6, 60).catch((e: unknown) => e);
    expect(short).toBeInstanceOf(AvatarRefusedError);
    expect((short as AvatarRefusedError).reason).toBe("not-enough-cobbles");
    await act(() => result.current.writes.buy(7, 4, 20));
    await waitFor(() => expect(result.current.catalogue.data?.balance).toBe(30));
    expect(result.current.catalogue.data!.owned[7]).toBe(1n << 4n);
    const look = encodeAvatar({ ...DEFAULT_AVATAR, headwear: 4, skin: 2 });
    await act(() => result.current.writes.save(look));
    await waitFor(() => expect(result.current.avatar.data?.look).toBe(look));
    expect(savedLook(result.current.avatar.data)).toBe(look);
    // An item neither free nor owned is refused, and the look stays.
    const unowned = await result.current.writes.save(encodeAvatar({ ...DEFAULT_AVATAR, headwear: 5 })).catch((e: unknown) => e);
    expect((unowned as AvatarRefusedError).reason).toBe("not-owned");
  });

  it("a village founded, rewards opened and claimed (#646); no parcel or tier read (#739)", async () => {
    const sources = make();
    const { result } = renderData(
      () => ({ village: useVillage(PLAYER, "Ada"), reward: useVillageReward(PLAYER), writes: useVillageWrites(PLAYER), account: useCobbleAccount(PLAYER), buy: useBuyPack(PLAYER) }),
      sources,
    );
    await waitFor(() => expect(result.current.village.data?.founded).toBe(false));
    expect(result.current.reward.data).toEqual({ offer: null, pending: MOCK_STARTING_REWARDS });
    // The mock reserves no skin to a tier any more.
    expect(MOCK_SKIN_TIERS.size).toBe(0);

    await act(() => result.current.writes.found());
    await waitFor(() => expect(result.current.village.data?.founded).toBe(true));
    expect(result.current.village.data!.village.cells).toHaveLength(9);
    expect(result.current.village.data).not.toHaveProperty("parcel");
    await act(() => result.current.buy.mutation.mutateAsync({ playerId: PLAYER, packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null }));
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(50));

    // A reward: three tiles of the base deck; the Cobbles instead.
    await act(() => result.current.writes.open());
    await waitFor(() => expect(result.current.reward.data?.offer?.plans).toHaveLength(3));
    expect(result.current.reward.data!.pending).toBe(MOCK_STARTING_REWARDS - 1);
    for (const plan of result.current.reward.data!.offer!.plans) expect(plan).toBeGreaterThanOrEqual(1);
    await act(() => result.current.writes.cobbles());
    await waitFor(() => expect(result.current.account.data?.cobbles).toBe(55));
    expect(result.current.reward.data?.offer).toBeNull();

    // Another: a tile placed where it fits; the score is the engine's.
    await act(() => result.current.writes.open());
    await waitFor(() => expect(result.current.reward.data?.offer).not.toBeNull());
    const plans = result.current.reward.data!.offer!.plans;
    const village = result.current.village.data!.village;
    const slot = plans.findIndex((p) => legalCells(village, p).length > 0);
    const spot = legalCells(village, plans[slot]!)[0]!;
    await act(() => result.current.writes.place(slot, spot.orientations[0]!, spot));
    await waitFor(() => expect(result.current.village.data?.village.tiles).toHaveLength(2));
    expect(result.current.reward.data?.pending).toBe(MOCK_STARTING_REWARDS - 2);
    const twice = await result.current.writes.cobbles().catch((e: unknown) => e);
    expect((twice as VillageRefusedError).reason).toBe("no-offer");
  });

  it("a new player's ring is level 1 with 0 XP (Setup.player_level, #641)", async () => {
    const sources = make();
    expect(await dataOf(renderData(() => usePlayerProgress(PLAYER), sources).result)).toEqual({ level: 1, xp: 0, xpForNext: 100, total: 0 });
  });

  it("a deposit in the Vault turns PAVED into vPAVED; withdraw all gives it back less the exit fee", async () => {
    const sources = make();
    const { result } = renderData(() => ({ position: useVaultPosition(PLAYER), paved: usePavedBalance(PLAYER), writes: useVaultWrites(PLAYER) }), sources);
    await waitFor(() => expect(result.current.paved.data).toBe(MOCK_STARTING_PAVED));
    expect((await dataOf({ get current() { return result.current.position; } }))!.shares).toBe(0n);
    expect(await act(() => result.current.writes.send({ kind: "deposit", amount: 100n * P }))).toBe(true);
    const minted = (100n * P * (MOCK_VAULT.supply + 1n)) / (MOCK_VAULT.assets + 1n);
    await waitFor(() => expect(result.current.position.data?.shares).toBe(minted));
    await waitFor(() => expect(result.current.paved.data).toBe(MOCK_STARTING_PAVED - 100n * P));
    const back = result.current.position.data!.maxWithdraw;
    expect(back).toBeLessThan(100n * P);
    expect(await act(() => result.current.writes.send({ kind: "withdrawAll", shares: minted, exitFeeBps: 500 }))).toBe(true);
    await waitFor(() => expect(result.current.position.data?.shares).toBe(0n));
    await waitFor(() => expect(result.current.paved.data).toBe(MOCK_STARTING_PAVED - 100n * P + back));
  });
});

describe("the mock", () => {
  it("a weekly's claim adds its Cobbles and marks it claimed; a second claim is refused", async () => {
    const { sources, chain } = mockImplementation();
    // The fixture's quests are dailies: quest 1 as a weekly, Monday to Sunday UTC.
    chain.fixture.quests = [{ ...chain.fixture.quests[0], start_time: 345_600, duration: 7 * 86_400, interval: 7 * 86_400 }];
    const week = weekOfDay(TODAY)!;
    const { result } = renderData(() => ({ rewards: useQuestRewards(PLAYER, TODAY), claims: useClaims(PLAYER) }), sources);
    const rewards = await dataOf({ get current() { return result.current.rewards; } });
    expect(rewards!.cobbles.find((q) => q.questId === 1)).toEqual({ questId: 1, cobbles: 15, kind: "weekly" });
    expect(rewards!.balance).toBe(0);
    await act(() => result.current.claims.claim("quest:1", [{ kind: "quest", questId: 1, period: week }]));
    await waitFor(() => expect(result.current.rewards.data?.balance).toBe(15));
    expect(result.current.rewards.data!.week.claimed & (1n << 1n)).toBe(1n << 1n);
    const again = await result.current.claims.claim("quest:1", [{ kind: "quest", questId: 1, period: week }]).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ClaimRefusedError);
    expect((again as ClaimRefusedError).reason).toBe("claimed");
  });

  it("a daily pays nothing on its own, and the day has no bonus (#869): both claims are refused, nothing moves", async () => {
    const { sources, ledger } = mockImplementation();
    await sources.indexer.definitions();
    const writes = ledger.writesFor(PLAYER);
    const quest = await writes.claimQuest(1, TODAY).catch((e: unknown) => e);
    expect(quest).toBeInstanceOf(ClaimRefusedError);
    expect((quest as ClaimRefusedError).reason).toBe("no-cobbles");
    const bonus = await writes.claimDailyCredit(TODAY).catch((e: unknown) => e);
    expect(bonus).toBeInstanceOf(ClaimRefusedError);
    expect((bonus as ClaimRefusedError).reason).toBe("no-live-quest");
    expect((await ledger.account(PLAYER)).cobbles).toBe(0);
    expect(await ledger.dayProgress(PLAYER, TODAY)).toMatchObject({ claimed: 0n, credit: false });
  });

  it("five dailies a day on the mock's indexer (#869): the fifth, finish 2 games, counted from the day's Challenge games", async () => {
    const { sources, chain } = mockImplementation();
    const defined = (await sources.indexer.definitions()).data.quests;
    expect(defined.filter((d) => d.questId >= 17).map((d) => [d.questId, d.tasks[0]!.total, d.startTime / 86_400, d.interval / 86_400, d.cobbles])).toEqual([
      [17, 2, 0, 3, 0],
      [18, 3, 1, 3, 0],
      [19, 4, 2, 3, 0],
    ]);
    // Today (day mod 3 = 0) the fifth daily is quest 17, one game of two (the fixture's game of the day).
    expect(TODAY % 3).toBe(0);
    const { result } = renderData(() => usePlayerQuests(PLAYER, TODAY), sources);
    const today = await dataOf(result);
    const dailies = today!.quests.filter((q) => questPeriod(q) === "daily");
    expect(dailies).toHaveLength(DAILY_QUESTS);
    expect(dailies.at(-1)).toMatchObject({ questId: 17, tasks: [{ taskId: 1, total: 2, count: 1 }], completed: false, completedAt: null });
    // A second game over today completes it; one tomorrow counts for tomorrow only.
    playDailies(chain, [1], 1);
    playDailies(chain, [1], 1, TODAY + 1);
    const again = (await sources.indexer.playerQuests(PLAYER, { day: TODAY })).data.quests.find((q) => q.questId === 17)!;
    // Done at the end of its second game: the fixture's, which ended after the one played here.
    expect(again).toMatchObject({ completed: true, completedAt: 1_791_871_203, tasks: [{ count: 2 }] });
    const tomorrow = (await sources.indexer.playerQuests(PLAYER, { day: TODAY + 1 })).data.quests.find((q) => q.questId === 18)!;
    expect(tomorrow).toMatchObject({ completed: false, tasks: [{ total: 3, count: 1 }] });
    // A day with no daily live (before the quests were defined) gets none.
    chain.fixture.questsFromDay = TODAY;
    expect((await sources.indexer.playerQuests(PLAYER, { day: TODAY - 1 })).data.quests).toEqual([]);
  });

  it("counts no free game for the fifth daily (a free game reports no quest progress): its milestone stays out of reach", async () => {
    const { sources, chain, ledger } = mockImplementation();
    // The four fixture dailies done, and two free games over today beside the fixture's one paid game.
    playDailies(chain, [1, 2, 3, 4], 2, TODAY, true);
    const fifth = (await sources.indexer.playerQuests(PLAYER, { day: TODAY })).data.quests.find((q) => q.questId === 17)!;
    expect(fifth).toMatchObject({ completed: false, tasks: [{ total: 2, count: 1 }] });
    const refused = await ledger.writesFor(PLAYER).claimDailyMilestone(TODAY, 1).catch((e: unknown) => e);
    expect((refused as DailyMilestoneRefusedError).reason).toBe("not-reached");
    // A paid game completes it.
    playDailies(chain, [1, 2, 3, 4], 1);
    await ledger.writesFor(PLAYER).claimDailyMilestone(TODAY, 1);
    expect((await ledger.account(PLAYER)).cobbles).toBe(15);
  });

  it("counts for the fifth daily a paid game finished across midnight, though the indexer has no end time for it", async () => {
    const { sources, chain, ledger } = mockImplementation();
    playDailies(chain, [1, 2, 3, 4]);
    // Started yesterday at 23:55, finished today: `end_in_day` sets no end time (0), yet the contract counts its quests today.
    const start = TODAY * 86_400 - 300;
    chain.fixture.games.push({ contract: "challenge", game_id: 6_000, player_id: PLAYER, mode: 1, start_time: start, day_id: TODAY - 1, over: true, score: 90, counted_day_id: 0, end_time: 0, token_id: null, free: false });
    chain.fixture.games.sort((a, b) => b.start_time - a.start_time);
    const fifth = (await sources.indexer.playerQuests(PLAYER, { day: TODAY })).data.quests.find((q) => q.questId === 17)!;
    // With the fixture's paid game of the day: two of two, done no earlier than midnight.
    expect(fifth).toMatchObject({ completed: true, tasks: [{ total: 2, count: 2 }] });
    expect(fifth.completedAt).toBeGreaterThanOrEqual(TODAY * 86_400);
    // Not on the day it started (quest 19 there, four games): its count holds none of it.
    const before = (await sources.indexer.playerQuests(PLAYER, { day: TODAY - 1 })).data.quests.find((q) => q.questId === 19);
    expect(before?.tasks[0]?.count ?? 0).toBe(0);
    // So the day's five dailies are done: the second milestone pays.
    await ledger.writesFor(PLAYER).claimDailyMilestone(TODAY, 1);
    expect((await ledger.account(PLAYER)).cobbles).toBe(15);
  });

  it("counts for the fifth daily a paid game surrendered two days after its start on its surrender's day, not the day after its start", async () => {
    const { sources, chain, ledger } = mockImplementation();
    playDailies(chain, [1, 2, 3, 4]);
    // Started two days ago at 10:00, surrendered today at 09:00 (`surrender` checks no expiry): the indexer has no end time for it,
    // and it started before the pages the day reads.
    // 100 free games started after it (they count for nothing): the pages read stop before reaching it, so it is read by its id.
    for (let i = 0; i < 100; i++) {
      const start = (TODAY - 2) * 86_400 + 12 * 3_600 + i * 60;
      chain.fixture.games.push({ contract: "challenge", game_id: 7_000 + i, player_id: PLAYER, mode: 1, start_time: start, day_id: TODAY - 2, over: true, score: 10, counted_day_id: TODAY - 2, end_time: start + 30, token_id: null, free: true });
    }
    const surrendered = TODAY * 86_400 + 9 * 3_600;
    await surrenderGame(chain, ledger, 6_100, (TODAY - 2) * 86_400 + 10 * 3_600, surrendered);
    const requests = chain.fixture.requests.length;
    const quest = async (day: number, id: number) => (await sources.indexer.playerQuests(PLAYER, { day })).data.quests.find((q) => q.questId === id)!;
    // Today (quest 17, two games): the fixture's paid game of the day and the surrender, done at the later of the two.
    const fifth = await quest(TODAY, 17);
    expect(fifth).toMatchObject({ completed: true, tasks: [{ total: 2, count: 2 }] });
    expect(fifth.completedAt).toBe(Math.max(surrendered, 1_791_871_203));
    expect(chain.fixture.requests.slice(requests).some((r) => r === "/v1/games/challenge/6100")).toBe(true);
    // Not the day after its start (quest 19), nor its start's (quest 18).
    expect((await quest(TODAY - 1, 19)).tasks[0]!.count).toBe(0);
    expect((await quest(TODAY - 2, 18)).tasks[0]!.count).toBe(0);
    // So today's five dailies are done: the second milestone pays; yesterday's stays out of reach.
    await ledger.writesFor(PLAYER).claimDailyMilestone(TODAY, 1);
    expect((await ledger.account(PLAYER)).cobbles).toBe(15);
    const refused = await ledger.writesFor(PLAYER).claimDailyMilestone(TODAY - 1, 1).catch((e: unknown) => e);
    expect((refused as DailyMilestoneRefusedError).reason).toBe("not-reached");
  });

  it("records a Challenge game's surrender through the mock's signer, once the chain took it", async () => {
    const { ledger } = mockImplementation();
    const surrender = vi.fn(async () => ({ transactionHash: "0x5", events: [] }));
    const signer = mockSigner({ address: PLAYER, surrender } as unknown as GameSigner, ledger);
    const before = Math.floor(Date.now() / 1000);
    expect(await signer.surrender({ mode: "challenge", gameId: 6_200 })).toEqual({ transactionHash: "0x5", events: [] });
    expect(surrender).toHaveBeenCalledWith({ mode: "challenge", gameId: 6_200 });
    expect(ledger.surrenders(PLAYER)[6_200]).toBeGreaterThanOrEqual(before);
    // A refused surrender records nothing.
    surrender.mockRejectedValueOnce(new Error("refused"));
    await expect(signer.surrender({ mode: "challenge", gameId: 6_201 })).rejects.toThrow("refused");
    expect(ledger.surrenders(PLAYER)[6_201]).toBeUndefined();
  });

  it("counts the fifth daily of an older day past the indexer's first pages: its games are read however many came after", async () => {
    const { sources, chain, ledger } = mockImplementation();
    // Day mod 3 = 0: the fifth daily is quest 17, two games. Its two games, then 150 newer ones over the next days.
    const day = TODAY - 3;
    playDailies(chain, [1, 2, 3, 4], 2, day);
    for (const later of [day + 1, day + 2, TODAY]) playDailies(chain, [1, 2, 3, 4], 50, later);
    const requests = chain.fixture.requests.length;
    const fifth = (await sources.indexer.playerQuests(PLAYER, { day })).data.quests.find((q) => q.questId === 17)!;
    expect(fifth).toMatchObject({ completed: true, tasks: [{ total: 2, count: 2 }] });
    // Pages of 100 down to the day: the second holds its games.
    expect(chain.fixture.requests.slice(requests).filter((r) => r.includes("/games")).length).toBe(2);
    // So the day's second milestone, its five dailies done, is still earned.
    await ledger.writesFor(PLAYER).claimDailyMilestone(day, 1);
    expect(await ledger.dailyMilestones(PLAYER, day)).toEqual({ day, claimed: 0b10 });
  });

  it("the day's milestones (#869): 10 Cobbles at 3 dailies done, 15 at 5, each once a day, through the signer and the views", async () => {
    const { sources, chain } = mockImplementation();
    const views = sources.views as typeof sources.views & DailyMilestoneViews;
    const signer = sources.signer as GameSigner & DailyMilestoneWrites;
    expect(await views.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0 });
    const refused = async (step: number) => ((await signer.claimDailyMilestone(TODAY, step).catch((e: unknown) => e)) as DailyMilestoneRefusedError).reason;
    // Daily Run alone (the fixture's day): neither is reached, nothing moves.
    expect(await refused(0)).toBe("not-reached");
    expect(await refused(1)).toBe("not-reached");
    playDailies(chain, [1, 2]);
    expect(await refused(0)).toBe("not-reached");
    expect((await views.account(PLAYER)).cobbles).toBe(0);
    playDailies(chain, [1, 2, 3]);
    const first = await signer.claimDailyMilestone(TODAY, 0);
    expect(first.transactionHash.startsWith("0x6d6f636b")).toBe(true);
    expect(first.events).toEqual([{ name: "DailyMilestoneClaimed", fields: { playerId: PLAYER, day: TODAY, step: 0, cobbles: 10, balance: 10 }, fromAddress: "0x3" }]);
    expect(await views.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0b01 });
    const again = await signer.claimDailyMilestone(TODAY, 0).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(DailyMilestoneRefusedError);
    expect((again as DailyMilestoneRefusedError).reason).toBe("milestone-claimed");
    // Four done (the fourth fixture daily): the second still waits for the fifth, two games over today.
    playDailies(chain, [1, 2, 3, 4]);
    expect(await refused(1)).toBe("not-reached");
    playDailies(chain, [1, 2, 3, 4], 1);
    await signer.claimDailyMilestone(TODAY, 1);
    expect(await views.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0b11 });
    // 25 a day in all.
    expect((await views.account(PLAYER)).cobbles).toBe(DAILY_MILESTONES.reduce((sum, m) => sum + m.cobbles, 0));
    for (const step of [-1, 2, 1.5]) {
      const refused = await signer.claimDailyMilestone(TODAY, step).catch((e: unknown) => e);
      expect((refused as DailyMilestoneRefusedError).reason).toBe("no-milestone");
    }
    expect((await views.account(PLAYER)).cobbles).toBe(25);
  });

  it("the day's reset: the next day's milestones are claimable again, the day before keeps its claims, and they survive a reload", async () => {
    const { ledger, store, chain } = mockImplementation();
    const writes = ledger.writesFor(PLAYER);
    // Every daily done today (the fifth with a second game), three of them tomorrow (the fixture's progress holds every day).
    playDailies(chain, [1, 2, 3, 4], 1);
    await writes.claimDailyMilestone(TODAY, 0);
    await writes.claimDailyMilestone(TODAY, 1);
    expect(await ledger.dailyMilestones(PLAYER, TODAY + 1)).toEqual({ day: TODAY + 1, claimed: 0 });
    await writes.claimDailyMilestone(TODAY + 1, 0);
    expect(((await writes.claimDailyMilestone(TODAY + 1, 1).catch((e: unknown) => e)) as DailyMilestoneRefusedError).reason).toBe("not-reached");
    const reloaded = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
    expect(await reloaded.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0b11 });
    expect(await reloaded.dailyMilestones(PLAYER, TODAY + 1)).toEqual({ day: TODAY + 1, claimed: 0b01 });
    expect((await reloaded.account(PLAYER)).cobbles).toBe(35);
    // A day saved before the milestones (no `milestones` field) reads as none claimed.
    const state = JSON.parse(store.data.get(MOCK_KEY)!);
    const player = Object.values(state.players as Record<string, { days: Record<string, object> }>)[0]!;
    player.days[TODAY + 2] = { claimed: "0", credit: false };
    store.data.set(MOCK_KEY, JSON.stringify(state));
    expect(await new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 }).dailyMilestones(PLAYER, TODAY + 2)).toEqual({ day: TODAY + 2, claimed: 0 });
  });

  it("keeps its state on the device: a new ledger on the same store reads the claims, the packs and the Vault", async () => {
    const first = mockImplementation();
    const writes = first.ledger.writesFor(PLAYER, { paved: async () => 0n, usdc: async () => 100n * USDC });
    await writes.buyPack({ packId: 2, confirmedPrice: 9n * USDC, confirmedMinOut: 1n, referrer: null });
    await writes.deposit(10n * P, { confirmedAmount: 10n * P });
    expect(first.store.data.has(MOCK_KEY)).toBe(true);
    const reloaded = new MockLedger({ store: () => first.store, seller: "0x3", latencyMs: 0 });
    expect((await reloaded.account(PLAYER)).cobbles).toBe(100);
    expect(await reloaded.usdcBalance(PLAYER, 100n * USDC)).toBe(91n * USDC);
    expect((await reloaded.vault(PLAYER)).shares).toBeGreaterThan(0n);
    expect((await reloaded.vault(PLAYER)).totalAssets).toBe(MOCK_VAULT.assets + 10n * P);
    await reloaded.reset();
    expect((await new MockLedger({ store: () => first.store, seller: "0x3" }).account(PLAYER)).cobbles).toBe(0);
  });

  it("two tabs on one device: a write of one never stores a stale copy over the other's", async () => {
    const store = memoryStore();
    const a = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
    const b = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
    // Both tabs read before either writes.
    await a.vault(PLAYER);
    await b.vault(PLAYER);
    await a.writesFor(PLAYER).deposit(100n * P, { confirmedAmount: 100n * P });
    await b.writesFor(PLAYER).deposit(10n * P, { confirmedAmount: 10n * P });
    const fresh = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
    const first = (100n * P * (MOCK_VAULT.supply + 1n)) / (MOCK_VAULT.assets + 1n);
    const second = (10n * P * (MOCK_VAULT.supply + first + 1n)) / (MOCK_VAULT.assets + 100n * P + 1n);
    expect((await fresh.vault(PLAYER)).shares).toBe(first + second);
    expect(await fresh.pavedBalance(PLAYER)).toBe(MOCK_STARTING_PAVED - 110n * P);
    // And each tab reads the other's writes.
    expect((await a.vault(PLAYER)).shares).toBe(first + second);
  });

  it("holds a lock across tabs from the read of the stored state to its save: a write waits while another tab writes", async () => {
    const store = memoryStore();
    // The other tab holds the lock and writes while this one waits.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let queue: Promise<unknown> = held;
    const lock = <T,>(section: () => T): Promise<T> => {
      const run = queue.then(section);
      queue = run.catch(() => undefined);
      return run;
    };
    const mine = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, lock });
    const other = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
    const pending = mine.writesFor(PLAYER).deposit(10n * P, { confirmedAmount: 10n * P });
    await other.writesFor(PLAYER).deposit(100n * P, { confirmedAmount: 100n * P });
    expect(JSON.parse(store.data.get(MOCK_KEY)!).transactions).toBe(1);
    release();
    await pending;
    // The waiting write started from the other tab's state: both deposits are kept.
    const fresh = new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0 });
    expect(await fresh.pavedBalance(PLAYER)).toBe(MOCK_STARTING_PAVED - 110n * P);
    expect(JSON.parse(store.data.get(MOCK_KEY)!).transactions).toBe(2);
  });

  it("takes the browser's Web Lock named after the mock's key, and runs the write inside it", async () => {
    const requests: string[] = [];
    let inside = false;
    const locks = { request: async <T,>(name: string, callback: () => T) => (requests.push(name), (inside = true), await Promise.resolve(callback()).finally(() => (inside = false))) };
    vi.stubGlobal("navigator", { ...navigator, locks });
    try {
      expect(await mockLock(() => inside)).toBe(true);
      const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
      await ledger.writesFor(PLAYER).deposit(P, { confirmedAmount: P });
      expect(requests).toEqual([MOCK_KEY, MOCK_KEY]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("overlapping writes are checked again at commit: two deposits of 100 from 142.35 PAVED, one is refused", async () => {
    const ledger = new MockLedger({ store: () => memoryStore(), seller: "0x3", latencyMs: 20 });
    const writes = ledger.writesFor(PLAYER);
    const results = await Promise.allSettled([writes.deposit(100n * P, { confirmedAmount: 100n * P }), writes.deposit(100n * P, { confirmedAmount: 100n * P })]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.name).toBe("VaultBalanceError");
    expect(await ledger.pavedBalance(PLAYER)).toBe(MOCK_STARTING_PAVED - 100n * P);
    expect((await ledger.vault(PLAYER)).value).toBeLessThanOrEqual(100n * P);
    // The same for the packs' USDC, the skins' Cobbles and the withdraws.
    const usdc = { paved: async () => 0n, usdc: async () => 12n * USDC };
    const packs = await Promise.allSettled([1, 2].map(() => ledger.writesFor(PLAYER, usdc).buyPack({ packId: 2, confirmedPrice: 9n * USDC, confirmedMinOut: 1n, referrer: null })));
    expect(packs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await ledger.usdcBalance(PLAYER, 12n * USDC)).toBe(3n * USDC);
    const skins = await Promise.allSettled([13, 10].map((plan) => writes.buySkin({ theme: 1, plan, confirmedPrice: SKIN_PRICES[plan - 1]! })));
    expect(skins.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ledger.account(PLAYER)).cobbles).toBeGreaterThanOrEqual(0);
    const { shares } = await ledger.vault(PLAYER);
    const all = await Promise.allSettled([writes.withdrawAll({ confirmedShares: shares }), writes.withdrawAll({ confirmedShares: shares })]);
    expect(all.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ledger.vault(PLAYER)).shares).toBe(0n);
  });

  it("serves Challenge.initial_seed where the class has none: the contract's own Poseidon of 0, the Challenge and the id", async () => {
    const { chain, ledger } = mockImplementation();
    const challenge = "0x0619ce35ba96eb0a64af2a01a61a6aa5e18f0650246206c6dd39b4c882eed923";
    chain.views.initialSeed = async () => {
      throw new ViewError("not-available", "Not available on this network yet.");
    };
    const access = { challenge, gameFelts: async () => [] as string[], decodeGame: () => GAME_PLAYING };
    const views = mockGameViews(chain.views, ledger, access);
    const key = { mode: "challenge" as const, gameId: GAME_PLAYING.id };
    expect(await views.initialSeed(key)).toBe(`0x${poseidon(0n, BigInt(challenge), GAME_PLAYING.id).toString(16)}`);
    expect(initialSeedOf(challenge, 1)).toBe(`0x${poseidon(0n, BigInt(challenge), 1).toString(16)}`);
    // An id with no game is refused, as the view refuses it.
    await expect(views.initialSeed({ mode: "challenge", gameId: 9_999 })).rejects.toMatchObject({ kind: "game-not-found" });
    // Where the class has the view, the chain answers.
    const served = mockGameViews(mockImplementation().chain.views, ledger, access);
    chain.views.calls.length = 0;
    expect(await served.initialSeed(key)).toBe(GAME_PLAYING.seed);
  });

  it("reads a game from a class whose GameView predates expires_at: its felts, expires_at = start + 24 h", async () => {
    const { chain, ledger } = mockImplementation();
    chain.views.game = async () => {
      throw new ViewError("abi-mismatch", "game: Not enough felts to decode core::integer::u64");
    };
    const felts = Array.from({ length: GAME_FELTS_BEFORE_EXPIRY }, (_, i) => (i === 13 ? "0x6acf1092" : "0x1"));
    let decoded: string[] = [];
    const access = { challenge: "0x2", gameFelts: async () => felts, decodeGame: (f: string[]) => ((decoded = f), GAME_PLAYING) };
    const views = mockGameViews(chain.views, ledger, access);
    await views.game({ mode: "challenge", gameId: 1 });
    expect(decoded).toHaveLength(GAME_FELTS_BEFORE_EXPIRY + 1);
    expect(BigInt(decoded.at(-1)!)).toBe(0x6acf1092n + 86_400n);
    await expect(mockGameViews(chain.views, ledger, { ...access, gameFelts: async () => felts.slice(1) }).game({ mode: "challenge", gameId: 1 })).rejects.toMatchObject({ kind: "abi-mismatch" });
  });

  it("is deterministic: two fresh ledgers answer the same figures", async () => {
    const [a, b] = [mockImplementation().ledger, mockImplementation().ledger];
    for (const read of [(l: MockLedger) => l.vault(PLAYER), (l: MockLedger) => l.skinPrices(1), (l: MockLedger) => l.pack(4), (l: MockLedger) => l.account(PLAYER), (l: MockLedger) => l.split()]) {
      expect(await read(a)).toEqual(await read(b));
    }
  });

  it("refuses a write that the contract would revert, and leaves the ledger as it was", async () => {
    const { ledger } = mockImplementation();
    const writes = ledger.writesFor(PLAYER);
    await expect(writes.deposit(MOCK_STARTING_PAVED + 1n, { confirmedAmount: MOCK_STARTING_PAVED + 1n })).rejects.toThrow(/PAVED/);
    await expect(writes.setSkins([{ plan: 13, theme: 1 }])).rejects.toMatchObject({ reason: "not-owned" });
    await expect(writes.buyPack({ packId: 5, confirmedPrice: 1n, confirmedMinOut: 1n, referrer: null })).rejects.toThrow(/not on sale/);
    // A batch of claims is atomic: the unknown quest refuses the whole batch, the first claim included.
    ledger.definitions({ quests: [], achievements: [{ achievementId: 2, startTime: 0, endTime: 0, tasks: [{ taskId: 1, total: 1 }], points: 10, definedAt: 0, retired: false, retiredAt: null, cobbles: 0 }] });
    await expect(writes.claim([{ kind: "achievement", achievementId: 2 }, { kind: "quest", questId: 99, period: TODAY }])).rejects.toMatchObject({ reason: "no-cobbles" });
    expect(await ledger.account(PLAYER)).toMatchObject({ cobbles: 0, achievementsClaimed: 0n });
  });

  it("gives the definitions their Cobbles: none for a daily (#869), even its own; a weekly's own stay, else the table's", async () => {
    const { sources, chain } = mockImplementation();
    const definitions = (await sources.indexer.definitions()).data;
    expect(definitions.quests.map((q) => [q.questId, q.cobbles, q.cobblesKind])).toEqual([1, 2, 3, 4, 17, 18, 19].map((id) => [id, 0, "daily"]));
    expect(definitions.achievements.find((a) => a.achievementId === 4)?.cobbles).toBe(40);
    chain.fixture.quests = [{ ...chain.fixture.quests[0], cobbles: 7, cobbles_kind: "daily" }];
    expect((await sources.indexer.definitions()).data.quests[0]).toMatchObject({ cobbles: 0, cobblesKind: "daily" });
    const weekly = { start_time: 345_600, duration: 7 * 86_400, interval: 7 * 86_400 };
    chain.fixture.quests = [{ ...chain.fixture.quests[0], ...weekly, cobbles: 7, cobbles_kind: "weekly" }];
    expect((await sources.indexer.definitions()).data.quests[0]).toMatchObject({ cobbles: 7, cobblesKind: "weekly" });
    chain.fixture.quests = [{ ...chain.fixture.quests[0], ...weekly, quest_id: 14, cobbles: 0, cobbles_kind: null }];
    expect((await sources.indexer.definitions()).data.quests[0]).toMatchObject({ questId: 14, cobbles: 15, cobblesKind: "weekly" });
  });

  it("answers the referrals the indexer has no route for, without a request", async () => {
    const { sources, chain } = mockImplementation();
    const { result } = renderData(() => useReferralEarnings(PLAYER), sources);
    expect(await dataOf(result)).toEqual({ total: 0n, games: { count: 0, total: 0n }, packs: { count: 0, total: 0n } });
    expect(chain.fixture.requests.some((r) => r.includes("referrals"))).toBe(false);
    expect(referralKey(PLAYER)[0]).toBe("indexer");
  });

  it("leaves the games, the entry price and the economy's quote to the chain", async () => {
    const { sources, chain } = mockImplementation();
    await sources.views.game({ mode: "challenge", gameId: 1_042 });
    await sources.views.entryPrice();
    await sources.economy!.quote(1);
    expect(chain.views.calls).toEqual(["game challenge:1042", "entry_price"]);
    expect(chain.economy.calls).toEqual(["quote 1"]);
    await sources.views.spawnPaused();
    await sources.economy!.split();
    expect(chain.views.calls).not.toContain("spawn_paused");
    expect(chain.economy.calls).not.toContain("split");
  });

  it("keeps the writer a PavedWriter, its other writes the chain's, and refuses the free spawn in plain words", async () => {
    const { ledger } = mockImplementation();
    const writer = Object.create(PavedWriter.prototype) as PavedWriter & { mint: () => Promise<string> };
    Object.defineProperty(writer, "address", { value: PLAYER });
    writer.mint = async function (this: unknown) {
      return this === writer ? "chain" : "wrong this";
    };
    const signer = mockSigner(writer as unknown as GameSigner, ledger);
    expect(signer instanceof PavedWriter).toBe(true);
    expect(await (signer as unknown as { mint: () => Promise<string> }).mint()).toBe("chain");
    await expect(signer.spawnFree()).rejects.toThrow(FREE_SPAWN_MOCKED);
  });
});

describe("the switch", () => {
  it("is VITE_DATA_SOURCE when it names one, else the network's default: the mock on Sepolia, the chain elsewhere", () => {
    expect(dataSourceOf({ network: "sepolia" })).toBe("mock");
    expect(dataSourceOf({ source: "chain", network: "sepolia" })).toBe("chain");
    expect(dataSourceOf({ source: " Mock ", network: "devnet" })).toBe("mock");
    expect(dataSourceOf({ network: "devnet" })).toBe("chain");
    expect(dataSourceOf({ network: "mainnet" })).toBe("chain");
    expect(dataSourceOf({ source: "both", network: "mainnet" })).toBe("chain");
    expect(dataSourceOf({})).toBe("chain");
  });

  it("marks only pages of the route map", () => {
    const paths = new Set(PAGES.map((p) => p.path));
    for (const path of MOCKED_PAGES) expect(paths.has(path), path).toBe(true);
    expect(MOCKED_PAGES.has("game/:gameId")).toBe(false);
  });
});
