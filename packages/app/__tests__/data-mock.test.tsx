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
import { MOCK_MARK_TEXT } from "../src/components/containers/mock-mark";
import { MOCK_KEY, MOCK_SPLIT, MOCK_VAULT, MockLedger, mockLock, type TokenBalances } from "../src/data/mock/ledger";
import { FRESH_DEFINITIONS } from "../src/data/mock/definitions";
import { usePlayerProgress } from "../src/data/player-progress";
import { mockSigner } from "../src/data/mock/overlay";
import { DAILY_MILESTONES, DAILY_QUESTS } from "@paved/game-core";
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
import { buyGame, mockImplementation, playGame, surrenderedGame } from "./mock-fakes";
import { FakeSkinWriter } from "./skin-fakes";
import { FakeAvatarWriter } from "./avatar-fakes";
import { KING_TRAITS, encodeTraits } from "@paved/renderer";
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
/** The PAVED Ada won before these flows (a new account holds none, #927): the Vault's flows deposit from it, on both implementations. */
const WON_PAVED = 142_350_000_000_000_000_000n;
/** Ada's tokens in the mock's ledger: the faucet's USDC and the PAVED won, as the chain's fakes hold them. */
const WINNER: TokenBalances = { usdc: 100n * USDC, paved: WON_PAVED };

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
  economy.setBalance("paved", PLAYER, WON_PAVED);
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
  ["mock", () => mockImplementation(undefined, WINNER).sources],
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
    // The Wizard hat (headwear, part 7, item 4) costs 40 Cobbles.
    expect(result.current.catalogue.data!.items[7]![4]).toMatchObject({ state: 1, cobbles: 40 });
    expect(result.current.avatar.data).toEqual({ look: 0n, ids: null });
    // No Cobbles yet: refused, nothing spent.
    const short = await result.current.writes.buy(7, 4, 40).catch((e: unknown) => e);
    expect(short).toBeInstanceOf(AvatarRefusedError);
    expect((short as AvatarRefusedError).reason).toBe("not-enough-cobbles");
    await act(() => result.current.buy.mutation.mutateAsync({ playerId: PLAYER, packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null }));
    await waitFor(() => expect(result.current.catalogue.data?.balance).toBe(50));
    await act(() => result.current.writes.buy(7, 4, 40));
    await waitFor(() => expect(result.current.catalogue.data?.balance).toBe(10));
    expect(result.current.catalogue.data!.owned[7]).toBe(1n << 4n);
    const look = encodeTraits({ ...KING_TRAITS, headwear: "wizard", skin: "tan" });
    await act(() => result.current.writes.save(look));
    await waitFor(() => expect(result.current.avatar.data?.look).toBe(look));
    expect(savedLook(result.current.avatar.data)).toBe(look);
    // An item neither free nor owned is refused, and the look stays.
    const unowned = await result.current.writes.save(encodeTraits({ ...KING_TRAITS, headwear: "feathered" })).catch((e: unknown) => e);
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
    await waitFor(() => expect(result.current.paved.data).toBe(WON_PAVED));
    expect((await dataOf({ get current() { return result.current.position; } }))!.shares).toBe(0n);
    expect(await act(() => result.current.writes.send({ kind: "deposit", amount: 100n * P }))).toBe(true);
    const minted = (100n * P * (MOCK_VAULT.supply + 1n)) / (MOCK_VAULT.assets + 1n);
    await waitFor(() => expect(result.current.position.data?.shares).toBe(minted));
    await waitFor(() => expect(result.current.paved.data).toBe(WON_PAVED - 100n * P));
    const back = result.current.position.data!.maxWithdraw;
    expect(back).toBeLessThan(100n * P);
    expect(await act(() => result.current.writes.send({ kind: "withdrawAll", shares: minted, exitFeeBps: 500 }))).toBe(true);
    await waitFor(() => expect(result.current.position.data?.shares).toBe(0n));
    await waitFor(() => expect(result.current.paved.data).toBe(WON_PAVED - 100n * P + back));
  });
});

describe("the mock", () => {
  /** The mock on a clock of `clock.now` (seconds), today at 09:00 UTC by default. */
  const clocked = (clock = { now: TODAY * 86_400 + 9 * 3_600 }) => ({ clock, ...mockImplementation(undefined, WINNER, () => clock.now) });

  it("a weekly pays nothing on its own, and the week has no bonus (#976): both claims are refused, nothing moves", async () => {
    const { sources, ledger } = mockImplementation(undefined, WINNER);
    const week = weekOfDay(TODAY)!;
    const { result } = renderData(() => ({ rewards: useQuestRewards(PLAYER, TODAY), claims: useClaims(PLAYER) }), sources);
    const rewards = await dataOf({ get current() { return result.current.rewards; } });
    expect(rewards!.cobbles.find((q) => q.questId === 14)).toBeUndefined();
    const quest = await result.current.claims.claim("quest:14", [{ kind: "quest", questId: 14, period: week }]).catch((e: unknown) => e);
    expect(quest).toBeInstanceOf(ClaimRefusedError);
    expect((quest as ClaimRefusedError).reason).toBe("no-cobbles");
    const bonus = await ledger.writesFor(PLAYER).claimWeeklyCredit(week).catch((e: unknown) => e);
    expect(bonus).toBeInstanceOf(ClaimRefusedError);
    expect((bonus as ClaimRefusedError).reason).toBe("no-live-quest");
    expect((await ledger.account(PLAYER)).cobbles).toBe(0);
  });

  it("a daily pays nothing on its own, and the day has no bonus (#869): both claims are refused, nothing moves", async () => {
    const { sources, ledger } = mockImplementation(undefined, WINNER);
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

  it("defines the fresh deployment's quests and achievements and the fifth daily (#869), with no indexer", async () => {
    const { sources, chain } = mockImplementation(undefined, WINNER);
    const requests = chain.fixture.requests.length;
    const defined = (await sources.indexer.definitions()).data;
    expect(defined.quests.map((d) => [d.questId, d.tasks[0]!.taskId, d.tasks[0]!.total, d.startTime / 86_400, d.interval / 86_400])).toEqual([
      [1, 1, 1, 0, 1],
      [5, 2, 4, 0, 3],
      [6, 2, 8, 1, 3],
      [7, 2, 12, 2, 3],
      [8, 4, 2, 0, 3],
      [9, 4, 3, 1, 3],
      [10, 4, 4, 2, 3],
      [11, 3, 2_000, 0, 3],
      [12, 3, 5_000, 1, 3],
      [13, 3, 8_000, 2, 3],
      [14, 4, 5, 4, 7],
      [15, 2, 30, 4, 7],
      [16, 3, 20_000, 4, 7],
      [17, 1, 2, 0, 3],
      [18, 1, 3, 1, 3],
      [19, 1, 4, 2, 3],
      // The PvP weeklies (#976): 10 attacks settled, 15 stars.
      [20, 19, 10, 4, 7],
      [21, 20, 15, 4, 7],
    ]);
    expect(defined.achievements).toHaveLength(16);
    // Today (day mod 3 = 0): Daily Run, 5, 8, 11 and the fifth daily, 17; the five weeklies; nothing counted yet.
    expect(TODAY % 3).toBe(0);
    const today = (await sources.indexer.playerQuests(PLAYER, { day: TODAY })).data;
    expect(today.quests.map((q) => q.questId)).toEqual([1, 5, 8, 11, 14, 15, 16, 17, 20, 21]);
    expect(today.quests.every((q) => !q.completed && q.tasks[0]!.count === 0)).toBe(true);
    const { result } = renderData(() => usePlayerQuests(PLAYER, TODAY), sources);
    expect((await dataOf(result))!.quests.filter((q) => questPeriod(q) === "daily")).toHaveLength(DAILY_QUESTS);
    expect(chain.fixture.requests.length).toBe(requests);
  });

  it("counts each game over's report on the day it ended (#927): Daily Run, the rotating dailies, the weeklies and the fifth", async () => {
    const { sources, ledger, clock } = clocked();
    const { gameId, score } = await playGame(ledger, PLAYER);
    const quests = async (day = TODAY) => Object.fromEntries((await sources.indexer.playerQuests(PLAYER, { day })).data.quests.map((q) => [q.questId, q]));
    let today = await quests();
    // The game of the test's clock: 13 roads and cities, 3 forests, 8,162 points; Daily Run and the three rotating dailies
    // done at its end, the weeklies counting it.
    expect(score).toBe(8_162);
    const end = (await ledger.game({ mode: "challenge", gameId })).endTime;
    for (const id of [1, 5, 8, 11]) expect(today[id], String(id)).toMatchObject({ completed: true, completedAt: end });
    expect(today[17]).toMatchObject({ completed: false, tasks: [{ total: 2, count: 1 }] });
    expect([14, 15, 16].map((id) => today[id]!.tasks[0]!.count)).toEqual([3, 13, 8_162]);
    // A second game, surrendered: the fifth daily done at its end.
    clock.now += 600;
    const second = await surrenderedGame(ledger, PLAYER);
    today = await quests();
    expect(today[17]).toMatchObject({ completed: true, completedAt: (await ledger.game({ mode: "challenge", gameId: second })).endTime, tasks: [{ count: 2 }] });
    expect(today[1]!.completedAt).toBe(end);
    // One tomorrow counts for tomorrow only (quest 18, three games), and for the week.
    clock.now += 86_400;
    await surrenderedGame(ledger, PLAYER);
    const tomorrow = await quests(TODAY + 1);
    expect(tomorrow[18]).toMatchObject({ completed: false, tasks: [{ total: 3, count: 1 }] });
    expect(tomorrow[1]!.completed).toBe(true);
    expect((await quests())[17]!.tasks[0]!.count).toBe(2);
  });

  it("counts no free game for the quests (a free game reports no quest progress), but for the achievements", async () => {
    const { sources, ledger, store } = clocked();
    const gameId = await surrenderedGame(ledger, PLAYER);
    // The game made a free one (stake 0), as `spawn_free` leaves it.
    const state = JSON.parse(store.data.get(MOCK_KEY)!);
    state.challenge.games[gameId].stake = 0;
    store.data.set(MOCK_KEY, JSON.stringify(state));
    const daily = (await sources.indexer.playerQuests(PLAYER, { day: TODAY })).data.quests.find((q) => q.questId === 1)!;
    expect(daily).toMatchObject({ completed: false, tasks: [{ count: 0 }] });
    const settler = (await sources.indexer.playerAchievements(PLAYER)).data.achievements.find((a) => a.achievementId === 2)!;
    expect(settler).toMatchObject({ completed: true, tasks: [{ count: 1 }] });
  });

  it("counts a paid game over across midnight on the day it ended, and a surrender days after its start on its own day", async () => {
    const { sources, ledger, clock } = clocked({ now: TODAY * 86_400 - 300 });
    // Bought at 23:55, surrendered after midnight: today's, not yesterday's.
    const { gameId } = await buyGame(ledger, PLAYER);
    clock.now = TODAY * 86_400 + 60;
    await ledger.writesFor(PLAYER).surrender({ mode: "challenge", gameId });
    const quest = async (day: number, id: number) => (await sources.indexer.playerQuests(PLAYER, { day })).data.quests.find((q) => q.questId === id)!;
    expect(await quest(TODAY, 17)).toMatchObject({ tasks: [{ count: 1 }] });
    expect((await quest(TODAY - 1, 19)).tasks[0]!.count).toBe(0);
    // Bought two days before today, surrendered today (`surrender` checks no expiry): today's too, the fifth daily done.
    clock.now = (TODAY - 2) * 86_400 + 10 * 3_600;
    const { gameId: old } = await buyGame(ledger, PLAYER);
    clock.now = TODAY * 86_400 + 9 * 3_600;
    await ledger.writesFor(PLAYER).surrender({ mode: "challenge", gameId: old });
    expect(await quest(TODAY, 17)).toMatchObject({ completed: true, completedAt: clock.now, tasks: [{ count: 2 }] });
    expect((await quest(TODAY - 2, 18)).tasks[0]!.count).toBe(0);
  });

  it("plays a Challenge game's surrender through the mock's signer, on the ledger's game (#927); the chain's is never sent", async () => {
    const { ledger } = mockImplementation(undefined, WINNER);
    const surrender = vi.fn(async () => ({ transactionHash: "0x5", events: [] }));
    const signer = mockSigner({ address: PLAYER, surrender } as unknown as GameSigner, ledger);
    const { gameId } = await buyGame(ledger, PLAYER);
    const result = await signer.surrender({ mode: "challenge", gameId });
    expect(result.events.map((e) => e.name)).toEqual(["GameOver", "Recorded"]);
    expect(surrender).not.toHaveBeenCalled();
    await expect(signer.surrender({ mode: "challenge", gameId })).rejects.toThrow("Game: is over");
    await expect(signer.surrender({ mode: "challenge", gameId: 6_201 })).rejects.toThrow("Game: does not exist");
  });

  it("the day's milestones (#869): 10 Cobbles at 3 dailies done, 15 at 5, each once a day, through the signer and the views", async () => {
    const { sources, ledger, clock } = clocked();
    const views = sources.views as typeof sources.views & DailyMilestoneViews;
    const signer = sources.signer as GameSigner & DailyMilestoneWrites;
    expect(await views.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0 });
    const refused = async (step: number) => ((await signer.claimDailyMilestone(TODAY, step).catch((e: unknown) => e)) as DailyMilestoneRefusedError).reason;
    // Nothing played: neither is reached. A game played out: Daily Run, the roads and cities, the forests and the points.
    expect(await refused(0)).toBe("not-reached");
    expect(await refused(1)).toBe("not-reached");
    expect((await views.account(PLAYER)).cobbles).toBe(0);
    await playGame(ledger, PLAYER);
    const first = await signer.claimDailyMilestone(TODAY, 0);
    expect(first.transactionHash.startsWith("0x6d6f636b")).toBe(true);
    expect(first.events).toEqual([{ name: "DailyMilestoneClaimed", fields: { playerId: PLAYER, day: TODAY, step: 0, cobbles: 10, balance: 10 }, fromAddress: "0x3" }]);
    expect(await views.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0b01 });
    const again = await signer.claimDailyMilestone(TODAY, 0).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(DailyMilestoneRefusedError);
    expect((again as DailyMilestoneRefusedError).reason).toBe("milestone-claimed");
    // Four done: the second waits for the fifth, two games over today.
    expect(await refused(1)).toBe("not-reached");
    clock.now += 600;
    await surrenderedGame(ledger, PLAYER);
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
    const { ledger, store, clock, sources } = clocked();
    await sources.indexer.definitions();
    const writes = ledger.writesFor(PLAYER);
    // Every daily done today (a game played out and a surrender), then three of them tomorrow.
    await playGame(ledger, PLAYER);
    clock.now += 600;
    await surrenderedGame(ledger, PLAYER);
    await writes.claimDailyMilestone(TODAY, 0);
    await writes.claimDailyMilestone(TODAY, 1);
    expect(await ledger.dailyMilestones(PLAYER, TODAY + 1)).toEqual({ day: TODAY + 1, claimed: 0 });
    clock.now += 86_400;
    await playGame(ledger, PLAYER);
    expect(await ledger.dailyMilestones(PLAYER, TODAY + 1)).toEqual({ day: TODAY + 1, claimed: 0 });
    await writes.claimDailyMilestone(TODAY + 1, 0);
    expect(((await writes.claimDailyMilestone(TODAY + 1, 1).catch((e: unknown) => e)) as DailyMilestoneRefusedError).reason).toBe("not-reached");
    const reloaded = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    expect(await reloaded.dailyMilestones(PLAYER, TODAY)).toEqual({ day: TODAY, claimed: 0b11 });
    expect(await reloaded.dailyMilestones(PLAYER, TODAY + 1)).toEqual({ day: TODAY + 1, claimed: 0b01 });
    expect((await reloaded.account(PLAYER)).cobbles).toBe(35);
    // A day saved before the milestones (no `milestones` field) reads as none claimed.
    const state = JSON.parse(store.data.get(MOCK_KEY)!);
    const player = Object.values(state.players as Record<string, { days: Record<string, object> }>)[0]!;
    player.days[TODAY + 2] = { claimed: "0", credit: false };
    store.data.set(MOCK_KEY, JSON.stringify(state));
    expect(await new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 }).dailyMilestones(PLAYER, TODAY + 2)).toEqual({ day: TODAY + 2, claimed: 0 });
  });

  it("keeps its state on the device: a new ledger on the same store reads the claims, the packs and the Vault", async () => {
    const first = mockImplementation(undefined, WINNER);
    const writes = first.ledger.writesFor(PLAYER);
    await writes.buyPack({ packId: 2, confirmedPrice: 9n * USDC, confirmedMinOut: 1n, referrer: null });
    await writes.deposit(10n * P, { confirmedAmount: 10n * P });
    expect(first.store.data.has(MOCK_KEY)).toBe(true);
    const reloaded = new MockLedger({ starting: WINNER, store: () => first.store, seller: "0x3", latencyMs: 0 });
    expect((await reloaded.account(PLAYER)).cobbles).toBe(100);
    expect(await reloaded.usdcBalance(PLAYER)).toBe(91n * USDC);
    expect((await reloaded.vault(PLAYER)).shares).toBeGreaterThan(0n);
    expect((await reloaded.vault(PLAYER)).totalAssets).toBe(MOCK_VAULT.assets + 10n * P);
    await reloaded.reset();
    expect((await new MockLedger({ starting: WINNER, store: () => first.store, seller: "0x3" }).account(PLAYER)).cobbles).toBe(0);
  });

  it("two tabs on one device: a write of one never stores a stale copy over the other's", async () => {
    const store = memoryStore();
    const a = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    const b = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    // Both tabs read before either writes.
    await a.vault(PLAYER);
    await b.vault(PLAYER);
    await a.writesFor(PLAYER).deposit(100n * P, { confirmedAmount: 100n * P });
    await b.writesFor(PLAYER).deposit(10n * P, { confirmedAmount: 10n * P });
    const fresh = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    const first = (100n * P * (MOCK_VAULT.supply + 1n)) / (MOCK_VAULT.assets + 1n);
    const second = (10n * P * (MOCK_VAULT.supply + first + 1n)) / (MOCK_VAULT.assets + 100n * P + 1n);
    expect((await fresh.vault(PLAYER)).shares).toBe(first + second);
    expect(await fresh.pavedBalance(PLAYER)).toBe(WON_PAVED - 110n * P);
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
    const mine = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0, lock });
    const other = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    const pending = mine.writesFor(PLAYER).deposit(10n * P, { confirmedAmount: 10n * P });
    await other.writesFor(PLAYER).deposit(100n * P, { confirmedAmount: 100n * P });
    expect(JSON.parse(store.data.get(MOCK_KEY)!).transactions).toBe(1);
    release();
    await pending;
    // The waiting write started from the other tab's state: both deposits are kept.
    const fresh = new MockLedger({ starting: WINNER, store: () => store, seller: "0x3", latencyMs: 0 });
    expect(await fresh.pavedBalance(PLAYER)).toBe(WON_PAVED - 110n * P);
    expect(JSON.parse(store.data.get(MOCK_KEY)!).transactions).toBe(2);
  });

  it("takes the browser's Web Lock named after the mock's key, and runs the write inside it", async () => {
    const requests: string[] = [];
    let inside = false;
    const locks = { request: async <T,>(name: string, callback: () => T) => (requests.push(name), (inside = true), await Promise.resolve(callback()).finally(() => (inside = false))) };
    vi.stubGlobal("navigator", { ...navigator, locks });
    try {
      expect(await mockLock(() => inside)).toBe(true);
      const ledger = new MockLedger({ starting: WINNER, store: () => memoryStore(), seller: "0x3", latencyMs: 0 });
      await ledger.writesFor(PLAYER).deposit(P, { confirmedAmount: P });
      expect(requests).toEqual([MOCK_KEY, MOCK_KEY]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("overlapping writes are checked again at commit: two deposits of 100 from 142.35 PAVED, one is refused", async () => {
    // 12 USDC: one pack of 9 and not two.
    const ledger = new MockLedger({ starting: { usdc: 12n * USDC, paved: WON_PAVED }, store: () => memoryStore(), seller: "0x3", latencyMs: 20 });
    const writes = ledger.writesFor(PLAYER);
    const results = await Promise.allSettled([writes.deposit(100n * P, { confirmedAmount: 100n * P }), writes.deposit(100n * P, { confirmedAmount: 100n * P })]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.name).toBe("VaultBalanceError");
    expect(await ledger.pavedBalance(PLAYER)).toBe(WON_PAVED - 100n * P);
    expect((await ledger.vault(PLAYER)).value).toBeLessThanOrEqual(100n * P);
    // The same for the packs' USDC, the skins' Cobbles and the withdraws.
    const packs = await Promise.allSettled([1, 2].map(() => writes.buyPack({ packId: 2, confirmedPrice: 9n * USDC, confirmedMinOut: 1n, referrer: null })));
    expect(packs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await ledger.usdcBalance(PLAYER)).toBe(3n * USDC);
    const skins = await Promise.allSettled([13, 10].map((plan) => writes.buySkin({ theme: 1, plan, confirmedPrice: SKIN_PRICES[plan - 1]! })));
    expect(skins.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ledger.account(PLAYER)).cobbles).toBeGreaterThanOrEqual(0);
    const { shares } = await ledger.vault(PLAYER);
    const all = await Promise.allSettled([writes.withdrawAll({ confirmedShares: shares }), writes.withdrawAll({ confirmedShares: shares })]);
    expect(all.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ledger.vault(PLAYER)).shares).toBe(0n);
  });

  it("is deterministic: two fresh ledgers answer the same figures", async () => {
    const [a, b] = [mockImplementation(undefined, WINNER).ledger, mockImplementation(undefined, WINNER).ledger];
    for (const read of [(l: MockLedger) => l.vault(PLAYER), (l: MockLedger) => l.skinPrices(1), (l: MockLedger) => l.pack(4), (l: MockLedger) => l.account(PLAYER), (l: MockLedger) => l.split()]) {
      expect(await read(a)).toEqual(await read(b));
    }
  });

  it("refuses a write that the contract would revert, and leaves the ledger as it was", async () => {
    const { ledger } = mockImplementation(undefined, WINNER);
    const writes = ledger.writesFor(PLAYER);
    await expect(writes.deposit(WON_PAVED + 1n, { confirmedAmount: WON_PAVED + 1n })).rejects.toThrow(/PAVED/);
    await expect(writes.setSkins([{ plan: 13, theme: 1 }])).rejects.toMatchObject({ reason: "not-owned" });
    await expect(writes.buyPack({ packId: 5, confirmedPrice: 1n, confirmedMinOut: 1n, referrer: null })).rejects.toThrow(/not on sale/);
    // A batch of claims is atomic: the unknown quest refuses the whole batch, the first claim included.
    ledger.definitions({ quests: [], achievements: [{ achievementId: 2, startTime: 0, endTime: 0, tasks: [{ taskId: 1, total: 1 }], points: 10, definedAt: 0, retired: false, retiredAt: null, cobbles: 0 }] });
    await expect(writes.claim([{ kind: "achievement", achievementId: 2 }, { kind: "quest", questId: 99, period: TODAY }])).rejects.toMatchObject({ reason: "no-cobbles" });
    expect(await ledger.account(PLAYER)).toMatchObject({ cobbles: 0, achievementsClaimed: 0n });
  });

  it("gives the definitions their Cobbles: none for a quest, even its own (a daily since #869, a weekly since #976)", async () => {
    const { sources, ledger } = mockImplementation(undefined, WINNER);
    const definitions = (await sources.indexer.definitions()).data;
    // No weekly (#976) pays on its own, the PvP ones as the Challenge ones: the week's milestones do.
    const kindOf = (id: number) => ((id >= 14 && id <= 16) || id >= 20 ? "weekly" : "daily");
    expect(definitions.quests.map((q) => [q.questId, q.cobbles, q.cobblesKind])).toEqual(
      [1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((id) => [id, 0, kindOf(id)]),
    );
    expect(definitions.achievements.find((a) => a.achievementId === 4)?.cobbles).toBe(40);
    const [daily] = FRESH_DEFINITIONS.quests;
    const weekly = FRESH_DEFINITIONS.quests.find((q) => q.questId === 14)!;
    const one = (q: typeof daily) => ledger.definitions({ quests: [q!], achievements: [] }).quests[0];
    expect(one({ ...daily!, cobbles: 7, cobblesKind: "daily" })).toMatchObject({ cobbles: 0, cobblesKind: "daily" });
    expect(one({ ...weekly, questId: 1, cobbles: 7, cobblesKind: "weekly" })).toMatchObject({ cobbles: 0, cobblesKind: "weekly" });
    expect(one({ ...weekly, cobbles: 0, cobblesKind: null })).toMatchObject({ questId: 14, cobbles: 0, cobblesKind: "weekly" });
  });

  it("answers the referrals from the ledger, without a request", async () => {
    const { sources, chain } = mockImplementation(undefined, WINNER);
    const { result } = renderData(() => useReferralEarnings(PLAYER), sources);
    expect(await dataOf(result)).toEqual({ total: 0n, games: { count: 0, total: 0n }, packs: { count: 0, total: 0n } });
    expect(chain.fixture.requests).toEqual([]);
    expect(referralKey(PLAYER)[0]).toBe("indexer");
  });

  it("answers the games, the entry price and the economy's quote from the ledger (#927): the chain is never asked", async () => {
    const { sources, chain, ledger } = mockImplementation(undefined, WINNER);
    const { gameId } = await buyGame(ledger, PLAYER);
    await sources.views.game({ mode: "challenge", gameId });
    await sources.views.tiles({ mode: "challenge", gameId });
    await sources.views.entryPrice();
    await sources.economy!.quote(1);
    await sources.economy!.terms(gameId);
    await sources.events.playerGames(PLAYER, ["challenge"]);
    expect(chain.views.calls).toEqual([]);
    expect(chain.economy.calls).toEqual([]);
    await expect(sources.views.game({ mode: "challenge", gameId: 1_042 })).rejects.toMatchObject({ kind: "game-not-found" });
    await sources.views.spawnPaused();
    await sources.economy!.split();
    expect(chain.views.calls).not.toContain("spawn_paused");
    expect(chain.economy.calls).not.toContain("split");
  });

  it("keeps the writer a PavedWriter, its other writes the chain's, the faucet and the free spawn the ledger's", async () => {
    const { ledger } = mockImplementation(undefined, WINNER);
    const writer = Object.create(PavedWriter.prototype) as PavedWriter & { sendCalls: () => Promise<string> };
    Object.defineProperty(writer, "address", { value: PLAYER });
    writer.sendCalls = async function (this: unknown) {
      return this === writer ? "chain" : "wrong this";
    };
    const signer = mockSigner(writer as unknown as GameSigner, ledger);
    expect(signer instanceof PavedWriter).toBe(true);
    expect(await (signer as unknown as { sendCalls: () => Promise<string> }).sendCalls()).toBe("chain");
    // First Stone (#927): the ledger's claim, never the writer's.
    expect((await signer.claimTutorial()).events.map((e) => e.name)).toEqual(["AchievementProgressed"]);
    // The faucet (#927): the ledger's mint, never the writer's.
    await signer.mint();
    expect(await ledger.usdcBalance(PLAYER)).toBe(200n * USDC);
    // The free spawn (#927): the ledger's, refused without a credit.
    await expect(signer.spawnFree()).rejects.toMatchObject({ name: "NoCreditError" });
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

  it("marks every page of the route map, and only those (#927): the client runs on the device's data alone", () => {
    const paths = new Set(PAGES.map((p) => p.path));
    for (const path of MOCKED_PAGES) expect(paths.has(path), path).toBe(true);
    for (const path of paths) expect(MOCKED_PAGES.has(path), path).toBe(true);
    expect(MOCK_MARK_TEXT).toMatch(/this device's data alone/);
  });
});
