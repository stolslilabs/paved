import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { readPacks, type Definitions } from "@paved/chain";
import { questCobbles } from "../../data/cobbles";
import { MockLedger } from "../../data/mock/ledger";
import { PURCHASE, QUESTS, THEME_SHOP, VAULT } from "../../mocks/scenes";
import { QUEST_DEFINITIONS, QUESTS_TODAY } from "../../mocks/quests";
import { PLAYER_ID } from "../../mocks/players";
import { BALANCE_RICH } from "../../mocks/economy";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import { PurchaseScene, type PurchaseSceneProps } from "../../components/scenes/purchase-scene";
import { QuestsScene, type QuestsSceneProps } from "../../components/scenes/quests-scene";
import { ThemeShopScene, type ThemeShopSceneProps } from "../../components/scenes/theme-shop-scene";
import { VaultScene, type VaultSceneProps } from "../../components/scenes/vault-scene";

/**
 * The pages the mock serves on a network whose contracts are behind the client (MOCK-FIRST: Sepolia by default), each
 * read from a fresh mock ledger (`data/mock/ledger.ts`) and its flows run on it: the figures are the mock's own, the
 * "Mock" mark is in the header. The mock starts a player at 142.35 PAVED and no Cobbles; the quests are Sepolia's
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

/** A fresh ledger in memory, with no delay: a story starts from the mock's start every time. */
const ledger = () => new MockLedger({ store: () => null, seller: "0x3", latencyMs: 0 });

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

/** The Vault at the mock's start: no vPAVED, 142.35 PAVED in the wallet, a first deposit of 100 PAVED and its preview. */
export const VaultStart: Story = {
  loaders: [async () => ({ props: await vaultArgs(ledger(), 100n * P) })],
  render: (_args, { loaded }) => <VaultScene {...(loaded.props as VaultSceneProps)} />,
};

/** After a deposit of 100 PAVED on the mock: the position and the wallet moved, the receipt shown. */
export const VaultDeposited: Story = {
  loaders: [
    async () => {
      const l = ledger();
      const { events } = await l.writesFor(PLAYER_ID).deposit(100n * P, { confirmedAmount: 100n * P });
      const shares = BigInt(events[0]!.fields.shares as bigint);
      return { props: { ...(await vaultArgs(l, 10n * P)), done: { kind: "deposit", assets: 100n * P, shares } } };
    },
  ],
  render: (_args, { loaded }) => <VaultScene {...(loaded.props as VaultSceneProps)} />,
};

const questHandlers = { onDayChange: fn(), onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn(), onClaim: fn(), onClaimAll: fn(), onClaimCredit: fn(), onPlayFree: fn() };

async function questArgs(l: MockLedger): Promise<QuestsSceneProps> {
  const cobbles = questCobbles(l.definitions(definitions));
  const account = await l.account(PLAYER_ID);
  const day = await l.dayProgress(PLAYER_ID, QUESTS_TODAY.day);
  return {
    ...(QUESTS.today as QuestsSceneProps),
    ...questHandlers,
    rewards: { cobbles, day: { claimed: day.claimed, credit: day.credit }, week: { claimed: 0n, credit: false }, balance: account.cobbles, credits: account.credits },
  } as QuestsSceneProps;
}

/** Today's missions with the mock's Cobbles: Daily Run done, its 5 Cobbles to claim; nothing claimed yet, 0 Cobbles. */
export const MissionsToClaim: Story = {
  loaders: [async () => ({ props: await questArgs(ledger()) })],
  render: (_args, { loaded }) => <QuestsScene {...(loaded.props as QuestsSceneProps)} />,
};

/** Daily Run claimed on the mock: 5 Cobbles in the balance, its Claim gone. */
export const MissionsClaimed: Story = {
  loaders: [
    async () => {
      const l = ledger();
      l.definitions(definitions);
      await l.writesFor(PLAYER_ID).claimQuest(1, QUESTS_TODAY.day);
      return { props: await questArgs(l) };
    },
  ],
  render: (_args, { loaded }) => <QuestsScene {...(loaded.props as QuestsSceneProps)} />,
};

/** Challenge with the mark (MOCK-MARK, #622): "Mock" on the title's line, the tabs under the bar's line. */
export const Challenge: Story = {
  render: () => (
    <PurchaseScene
      {...(PURCHASE.cobblePacks as PurchaseSceneProps)}
      {...{ onStakeChange: fn(), onConfirm: fn(), onConnect: fn(), onBack: fn(), onTab: fn(), onSelectPack: fn(), onBuyPack: fn() }}
      tab="game"
    />
  ),
};

/** The Cobble shop on the mock: its four packs, 50 Cobbles after the first one (5 USDC) was bought with test USDC. */
export const PackBought: Story = {
  loaders: [
    async () => {
      const l = ledger();
      await l.writesFor(PLAYER_ID, { paved: async () => 0n, usdc: async () => BALANCE_RICH }).buyPack({ packId: 1, confirmedPrice: 5n * USDC, confirmedMinOut: 1n, referrer: null });
      const packs = await readPacks(l);
      const props: PurchaseSceneProps = {
        ...(PURCHASE.cobblePacks as PurchaseSceneProps),
        ...{ onStakeChange: fn(), onConfirm: fn(), onConnect: fn(), onBack: fn(), onTab: fn(), onSelectPack: fn(), onBuyPack: fn() },
        balance: await l.usdcBalance(PLAYER_ID, BALANCE_RICH),
        cobbles: { balance: (await l.account(PLAYER_ID)).cobbles, packs, selected: null },
      };
      return { props };
    },
  ],
  render: (_args, { loaded }) => <PurchaseScene {...(loaded.props as PurchaseSceneProps)} />,
};

/** Forest's shop on the mock after a pack: plan 13 (50 Cobbles) bought and set active, 0 Cobbles left. */
export const SkinBoughtAndSet: Story = {
  loaders: [
    async () => {
      const l = ledger();
      const writes = l.writesFor(PLAYER_ID, { paved: async () => 0n, usdc: async () => BALANCE_RICH });
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
