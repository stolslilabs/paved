import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { COBBLES } from "../../mocks/scenes";
import { CobblesScene } from "./cobbles-scene";

/** The Cobble packs (`/cobbles`, #621): the balance, the four packs, pick one and pay its USDC. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Cobbles", component: CobblesScene, args: { onSelectPack: fn(), onBuyPack: fn(), onConnect: fn(), onBack: fn() } } satisfies Meta<typeof CobblesScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** P-61: the four packs (50 for $5 to 1,000 for $70), the $0.20 reference struck through; none picked. */
export const Packs: Story = { args: COBBLES.packs };
/** A pack picked: Pay confirms, as for a game. */
export const Picked: Story = { args: COBBLES.picked };
/** A referrer: their share of the pack, as for a game. */
export const Referred: Story = { args: COBBLES.referred };
/** The approve and `buy_pack` on their way. */
export const Buying: Story = { args: COBBLES.buying };
/** Not enough USDC for the pack picked. */
export const Short: Story = { args: COBBLES.short };
/** WRAP360: the largest balances and a full referrer address. */
export const Stress: Story = { args: COBBLES.stress };

/** A guest: their Cobbles a dash, Pay is "Connect to buy". */
export const Guest: Story = { args: { ...COBBLES.picked, balance: null, connected: false } };
/** A pack bought: its Cobbles added, the balance from its `PackBought`. */
export const PackBought: Story = { args: { ...COBBLES.picked, cobbles: { ...COBBLES.picked.cobbles, balance: 340, bought: { cobbles: 100 } } } };
/** The packs are being read. */
export const PacksLoading: Story = { args: { ...COBBLES.packs, cobbles: { ...COBBLES.packs.cobbles, packs: [], loading: true } } };
/** The packs could not be read: Retry. */
export const PacksFailed: Story = { args: { ...COBBLES.packs, onRetryPacks: fn(), cobbles: { ...COBBLES.packs.cobbles, packs: [], error: "Cannot reach the node." } } };
/** No pack on sale. */
export const PacksNone: Story = { args: { ...COBBLES.packs, cobbles: { ...COBBLES.packs.cobbles, packs: [] } } };
/** The USDC balance could not be read: unknown, not 0; Pay waits, Retry reads it again. */
export const BalanceUnread: Story = { args: { ...COBBLES.picked, balance: null, balanceError: "Cannot reach the node.", onRetryBalance: fn() } };
/** A `?ref=` the pack's split would not pay: dropped, said, and the purchase goes on without it. */
export const ReferrerDropped: Story = { args: { ...COBBLES.picked, referrerDropped: true } };
/** A pack's outcome unknown: Buy waits while the Cobbles and USDC are read again. */
export const OutcomeUnknown: Story = {
  args: {
    ...COBBLES.picked,
    onCheckCobbles: fn(),
    cobbles: { ...COBBLES.picked.cobbles, checking: true, refusal: { kind: "unknown", message: "Purchase sent (0x5f1e), outcome unknown: check your Cobbles before buying again" } },
  },
};
/** The pack's purchase refused: the pack went off sale. */
export const Refused: Story = {
  args: { ...COBBLES.picked, cobbles: { ...COBBLES.picked.cobbles, refusal: { kind: "refused", message: "This pack is not on sale any more. Nothing was sent." } } },
};
