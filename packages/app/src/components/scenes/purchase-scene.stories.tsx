import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { PURCHASE, purchaseAt } from "../../mocks/scenes";
import { PurchaseScene } from "./purchase-scene";

/** The Challenge purchase (`/play/challenge`): stake 1 to 10, price and boost, split, 24 h validity, threshold, confirm. One story per state; the Viewport control reframes it. */
/** The slider moves the stake in every story: the price, boost and split follow it (the state's own stake is where it starts). */
function Stateful({ stake, onStakeChange, ...args }: React.ComponentProps<typeof PurchaseScene>) {
  const [current, setCurrent] = useState(stake);
  useEffect(() => setCurrent(stake), [stake]);
  return (
    <PurchaseScene
      {...args}
      {...purchaseAt(current)}
      onStakeChange={(s) => {
        setCurrent(s);
        onStakeChange?.(s);
      }}
    />
  );
}

const meta = { title: "Scenes/Purchase", component: PurchaseScene, render: (args) => <Stateful {...args} />, args: { onStakeChange: fn(), onConfirm: fn(), onConnect: fn(), onBack: fn(), onTab: fn(), onSelectPack: fn(), onBuyPack: fn() } } satisfies Meta<typeof PurchaseScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StakeOne: Story = { args: PURCHASE.stake1 };

/** A referrer from `?ref=`: the referral share names them. */
export const StakeThreeReferred: Story = { args: PURCHASE.stake3Referred };

/** The highest stake and boost. */
export const StakeTen: Story = { args: PURCHASE.stake10 };

export const NotEnoughUsdc: Story = { args: PURCHASE.short };

export const PurchasesPaused: Story = { args: PURCHASE.paused };

/** The approve and spawn on their way. */
export const Buying: Story = { args: PURCHASE.buying };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: PURCHASE.stress };
/** P-61, the Cobbles tab: the four packs (50 for $5 to 1,000 for $70), the $0.20 reference struck through; none picked. */
export const CobblePacks: Story = { args: PURCHASE.cobblePacks };
/** A pack picked: Pay confirms, as for a game. */
export const CobblePackPicked: Story = { args: PURCHASE.cobblePackPicked };
/** A referrer: their share of the pack, as for a game. */
export const CobblePackReferred: Story = { args: PURCHASE.cobblePackReferred };
/** The approve and `buy_pack` on their way. */
export const CobblePackBuying: Story = { args: PURCHASE.cobblePackBuying };
/** Not enough USDC for the pack picked. */
export const CobblePackShort: Story = { args: PURCHASE.cobblePackShort };
/** WRAP360: the largest balances and a full referrer address. */
export const CobbleStress: Story = { args: PURCHASE.cobbleStress };

// P7b: the states of the purchase on the chain's data.
/** A guest: Pay is "Connect to buy", whatever the balance. */
export const Guest: Story = { args: { ...PURCHASE.stake1, connected: false } };
/** The pool is being quoted for the stake's `min_out`: Pay waits. */
export const Quoting: Story = { args: { ...PURCHASE.stake1, quoting: true } };
/** The price changed since the confirm: nothing was spent, confirm again at the new price. */
export const PriceMoved: Story = {
  args: { ...PURCHASE.stake3Referred, refusal: { kind: "moved", message: "The price changed since you confirmed: check the new price and confirm again. Your USDC was not spent." } },
};
/** The pool's quote moved (the swap's `min_out`); the price did not. */
export const QuoteMoved: Story = { args: { ...PURCHASE.stake1, refusal: { kind: "quote-moved", message: "The pool's quote moved: confirm again. Your USDC was not spent." } } };
/** Another write of the account is on its way: a neutral wait. */
export const AnotherTransaction: Story = { args: { ...PURCHASE.stake1, refusal: { kind: "busy", message: "Wait for your other transaction, then confirm again." } } };
/** A pool quote far below the guard rate: Pay becomes Buy anyway. */
export const LowQuote: Story = {
  args: { ...PURCHASE.stake1, refusal: { kind: "low-quote", message: "The pool quotes far less PAVED than the guard rate for this purchase. Buy anyway, or try later." } },
};
/** The writer refused the purchase: its message. */
export const Refused: Story = { args: { ...PURCHASE.stake1, refusal: { kind: "refused", message: "This address cannot be your referrer. Nothing was sent." } } };
const UNKNOWN = { kind: "unknown", message: "Purchase sent (0x5f1e), outcome unknown: check your games before buying again" } as const;
/** Sent, but the receipt could not be read: Pay waits while the player's games and USDC are read again. */
export const OutcomeUnknown: Story = { args: { ...PURCHASE.stake1, refusal: UNKNOWN, checking: true, onCheckGames: fn() } };
/** The reads have settled: only a deliberate Buy again. */
export const OutcomeUnknownChecked: Story = { args: { ...PURCHASE.stake1, refusal: UNKNOWN, onCheckGames: fn() } };
/** The USDC balance could not be read: unknown, not 0; Pay waits, Retry reads it again. */
export const BalanceUnread: Story = { args: { ...PURCHASE.stake1, balance: null, balanceError: "Cannot reach the node.", onRetryBalance: fn() } };
/** A `?ref=` the contracts would not pay: dropped, said, and the purchase goes on without it. */
export const ReferrerDropped: Story = { args: { ...PURCHASE.stake1, referrerDropped: true } };
/** A guest on the Cobbles tab. */
export const CobbleGuest: Story = { args: { ...PURCHASE.cobblePackPicked, connected: false } };
/** A pack bought: its Cobbles added, the balance from its `PackBought`. */
export const CobblePackBought: Story = { args: { ...PURCHASE.cobblePackPicked, cobbles: { ...PURCHASE.cobblePackPicked.cobbles, balance: 340, bought: { cobbles: 100 } } } };
/** The packs are being read. */
export const CobblePacksLoading: Story = { args: { ...PURCHASE.cobblePacks, cobbles: { ...PURCHASE.cobblePacks.cobbles, packs: [], loading: true } } };
/** The packs could not be read: Retry. */
export const CobblePacksFailed: Story = {
  args: { ...PURCHASE.cobblePacks, onRetryPacks: fn(), cobbles: { ...PURCHASE.cobblePacks.cobbles, packs: [], error: "Cannot reach the node." } },
};
/** No pack on sale. */
export const CobblePacksNone: Story = { args: { ...PURCHASE.cobblePacks, cobbles: { ...PURCHASE.cobblePacks.cobbles, packs: [] } } };
/** A pack's outcome unknown: Buy waits while the Cobbles and USDC are read again. */
export const CobblePackUnknown: Story = {
  args: {
    ...PURCHASE.cobblePackPicked,
    onCheckCobbles: fn(),
    cobbles: { ...PURCHASE.cobblePackPicked.cobbles, checking: true, refusal: { kind: "unknown", message: "Purchase sent (0x5f1e), outcome unknown: check your Cobbles before buying again" } },
  },
};
/** The pack's purchase refused: the pack went off sale. */
export const CobblePackRefused: Story = {
  args: { ...PURCHASE.cobblePackPicked, cobbles: { ...PURCHASE.cobblePackPicked.cobbles, refusal: { kind: "refused", message: "This pack is not on sale any more. Nothing was sent." } } },
};
