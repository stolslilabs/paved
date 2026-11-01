import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { readPacks, type Definitions } from "@paved/chain";
import { questCobbles } from "../../data/cobbles";
import { MOCK_STARTING_BALANCES, MockLedger, type TokenBalances } from "../../data/mock/ledger";
import { COBBLES, MISSIONS, PURCHASE, THEME_SHOP, VAULT } from "../../mocks/scenes";
import { QUEST_DEFINITIONS, questsWeekDone } from "../../mocks/quests";
import { weekOfDay } from "../../lib/quest-window";
import { PLAYER_ID } from "../../mocks/players";
import { PAVED_BALANCE } from "../../mocks/economy";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import { CobblesScene, type CobblesSceneProps } from "../../components/scenes/cobbles-scene";
import { PurchaseScene } from "../../components/scenes/purchase-scene";
import { MissionsScene, type MissionsSceneProps } from "../../components/scenes/missions-scene";
import { ThemeShopScene, type ThemeShopSceneProps } from "../../components/scenes/theme-shop-scene";
import { VaultScene, type VaultSceneProps } from "../../components/scenes/vault-scene";

/**
 * The pages the mock serves on a network whose contracts are behind the client (MOCK-FIRST: Sepolia by default), each
 * read from a fresh mock ledger (`data/mock/ledger.ts`) and its flows run on it: the figures are the mock's own, the
 * "Mock" mark is in the header. The mock starts a player at 100 USDC (the faucet's), no PAVED and no Cobbles; the Vault's
 * stories start from a player who won 142.35 PAVED (`WINNER`). The quests are Sepolia's
 * schedule with the Cobbles the mock gives them.
 */
const withMark: Decorator = (Story) => (
  <MockMarkProvider value>
    <Story />
  </MockMarkProvider>
);

const meta = { title: "Scenes/Mocked data", decorators: [withMark] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const P = 10n ** 18n;
const USDC = 1_000_000n;

/** A fresh ledger in memory, with no delay: a story starts from the mock's start every time (`starting`: a new account's). */
const ledger = (starting: TokenBalances = MOCK_STARTING_BALANCES) => new MockLedger({ store: () => null, seller: "0x3", latencyMs: 0, starting });

/** A player who won PAVED (the Challenge's settlement, #927 PR 4): the stories' wallet, 142.35 PAVED beside the faucet's USDC. */
const WINNER: TokenBalances = { ...MOCK_STARTING_BALANCES, paved: PAVED_BALANCE };

/** The quests of the stories as the indexer's definitions of a deployment that predates the Cobbles (none on any of them). */
const definitions: Definitions = {
  quests: QUEST_DEFINITIONS.map((d) => ({
    questId: d.questId,
    startTime: d.start,
    endTime: 0,
    duration: d.duration,
    interval: d.interval,
    tasks: [{ taskId: d.taskId, total: d.total }],
    conditions: [],
    definedAt: 0,
    retired: false,
    retiredAt: null,
    cobbles: 0,
    cobblesKind: null,
  })),
  achievements: [],
};

const vaultHandlers = { onModeChange: fn(), onAmountChange: fn(), onMax: fn(), onDeposit: fn(), onWithdraw: fn(), onWithdrawAll: fn(), onPlay: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn() };

async function vaultArgs(l: MockLedger, amount: bigint): Promise<VaultSceneProps> {
  return { ...VAULT.noPosition, ...vaultHandlers, position: await l.vault(PLAYER_ID), balance: await l.pavedBalance(PLAYER_ID), split: await l.split(), amount: String(amount / P), preview: await l.previewDeposit(amount) };
}

/** The Vault of a player who won 142.35 PAVED: no vPAVED, a first deposit of 100 PAVED and its preview. */
export const VaultStart: Story = {
  loaders: [async () => ({ props: await vaultArgs(ledger(WINNER), 100n * P) })],
  render: (_args, { loaded }) => <VaultScene {...(loaded.props as VaultSceneProps)} />,
};

/** After a deposit of 100 PAVED on the mock: the position and the wallet moved, the receipt shown. */
export const VaultDeposited: Story = {
  loaders: [
    async () => {
      const l = ledger(WINNER);
      const { events } = await l.writesFor(PLAYER_ID).deposit(100n * P, { confirmedAmount: 100n * P });
      const shares = BigInt(events[0]!.fields.shares as bigint);
      return { props: { ...(await vaultArgs(l, 10n * P)), done: { kind: "deposit", assets: 100n * P, shares } } };
    },
  ],
  render: (_args, { loaded }) => <VaultScene {...(loaded.props as VaultSceneProps)} />,
};

const questHandlers = { onConnect: fn(), onRetry: fn(), onNavigate: fn(), onClaimQuest: fn(), onClaimAchievement: fn(), onClaimWeeklyMilestone: fn() };

/** Today with the three Challenge weeklies done (#976): three of five, the week's first gift reached. */
const WEEK_THREE = questsWeekDone(3);
/** Today's week on the mock: no daily nor weekly pays on its own (#869, #976), so the stories claim the week's first gift. */
const WEEK = weekOfDay(WEEK_THREE.day)!;

/** A ledger whose indexer counts three weeklies done this week, as `WEEK_THREE` shows them. */
function weekLedger(): MockLedger {
  const l = ledger();
  l.definitions(definitions);
  l.countWeekliesWith(async () => 3);
  return l;
}

async function questArgs(l: MockLedger): Promise<MissionsSceneProps> {
  const cobbles = questCobbles(l.definitions(definitions));
  const account = await l.account(PLAYER_ID);
  const day = await l.dayProgress(PLAYER_ID, WEEK_THREE.day);
  const week = await l.weekProgress(PLAYER_ID, WEEK);
  return {
    ...(MISSIONS.noRewards as MissionsSceneProps),
    ...questHandlers,
    quests: WEEK_THREE,
    rewardsUnavailable: null,
    initialSelected: "quest:14",
    questRewards: { cobbles, day: { claimed: day.claimed, credit: day.credit }, week: { claimed: week.claimed, credit: week.credit }, balance: account.cobbles, credits: account.credits },
    weeklyMilestones: await l.weeklyMilestones(PLAYER_ID, WEEK),
  };
}

/** Today's missions with the mock's Cobbles: three weeklies done, the week's first gift (50 Cobbles) to claim from its bar; 0 Cobbles. */
export const MissionsToClaim: Story = {
  loaders: [async () => ({ props: await questArgs(weekLedger()) })],
  render: (_args, { loaded }) => <MissionsScene {...(loaded.props as MissionsSceneProps)} />,
};

/** The week's first gift claimed on the mock: 50 Cobbles in the balance, the gift open with its check. */
export const MissionsClaimed: Story = {
  loaders: [
    async () => {
      const l = weekLedger();
      await l.writesFor(PLAYER_ID).claimWeeklyMilestone(WEEK, 0);
      return { props: await questArgs(l) };
    },
  ],
  render: (_args, { loaded }) => <MissionsScene {...(loaded.props as MissionsSceneProps)} />,
};

/** Challenge with the mark (MOCK-MARK, #622): "Mock" on the title's line. */
export const Challenge: Story = {
  render: () => <PurchaseScene {...PURCHASE.stake1} {...{ onStakeChange: fn(), onConfirm: fn(), onConnect: fn(), onBack: fn() }} />,
};

/** The Cobble packs on the mock (#621): its four packs, 50 Cobbles after the first one (5 USDC) was bought with the faucet's USDC, 95 USDC left. */
export const PackBought: Story = {
  loaders: [
    async () => {
      const l = ledger();
      await l.writesFor(PLAYER_ID).buyPack({ packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null });
      const packs = await readPacks(l);
      const props: CobblesSceneProps = {
        ...(COBBLES.packs as CobblesSceneProps),
        ...{ onConnect: fn(), onBack: fn(), onSelectPack: fn(), onBuyPack: fn() },
        balance: await l.usdcBalance(PLAYER_ID),
        cobbles: { balance: (await l.account(PLAYER_ID)).cobbles, packs, selected: null },
      };
      return { props };
    },
  ],
  render: (_args, { loaded }) => <CobblesScene {...(loaded.props as CobblesSceneProps)} />,
};

/** Forest's shop on the mock after a pack: plan 13 (50 Cobbles) bought and set active, 0 Cobbles left. */
export const SkinBoughtAndSet: Story = {
  loaders: [
    async () => {
      const l = ledger();
      const writes = l.writesFor(PLAYER_ID);
      await writes.buyPack({ packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null });
      await writes.buySkin({ theme: 1, plan: 13, confirmedPrice: 50 });
      await writes.setSkins([{ plan: 13, theme: 1 }]);
      const props: ThemeShopSceneProps = {
        ...THEME_SHOP.forest,
        ...{ onBack: fn(), onNavigate: fn(), onBuy: fn(), onBuyCobbles: fn(), onMyTiles: fn() },
        skins: { balance: (await l.account(PLAYER_ID)).cobbles, prices: await l.skinPrices(1), owned: await l.ownedSkins(PLAYER_ID, 1), active: await l.activeSkins(PLAYER_ID) },
      };
      return { props };
    },
  ],
  render: (_args, { loaded }) => <ThemeShopScene {...(loaded.props as ThemeShopSceneProps)} />,
};
