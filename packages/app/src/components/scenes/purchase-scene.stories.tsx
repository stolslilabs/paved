import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { PURCHASE, purchaseAt } from "../../mocks/scenes";
import { PurchaseScene } from "./purchase-scene";

/** The Challenge purchase (`/play/challenge`): stake 1 to 10, price and boost, split, 24 h validity, threshold, confirm. One story per state; the Viewport control reframes it. */
/**
 * The slider moves the stake in every story: the price, boost, split and reward follow it. The state's own stake is where it
 * starts, with the state's own quote and reward (a lower cap, a reward loading) until the slider moves.
 */
function Stateful({ stake, onStakeChange, ...args }: React.ComponentProps<typeof PurchaseScene>) {
  const [current, setCurrent] = useState(stake);
  useEffect(() => setCurrent(stake), [stake]);
  return (
    <PurchaseScene
      {...args}
      stake={current}
      {...(current === stake ? {} : purchaseAt(current, args.referrer !== null))}
      onStakeChange={(s) => {
        setCurrent(s);
        onStakeChange?.(s);
      }}
    />
  );
}

const meta = { title: "Scenes/Purchase", component: PurchaseScene, render: (args) => <Stateful {...args} />, args: { onStakeChange: fn(), onConfirm: fn(), onConnect: fn(), onBack: fn() } } satisfies Meta<typeof PurchaseScene>;
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

// #705: the reward by score in the Terms card.
/** A cap of 2: the cap is paid from 1,883 points, inside the multiples shown. */
export const RewardCapReached: Story = { args: PURCHASE.capReached };
/** The pool pays more than the guard allows: the reward counts 110 % of the guard's rate. */
export const RewardGuarded: Story = { args: PURCHASE.guarded };
/** The pool's quote or the guard's rate is being read. */
export const RewardLoading: Story = { args: PURCHASE.rewardLoading };
/** A read the estimate needs failed: why. */
export const RewardError: Story = { args: PURCHASE.rewardError };

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
const UNKNOWN = { kind: "unknown", message: "Purchase sent 5 min ago (0x5f1e), outcome unknown: check your games before buying again." } as const;
/** Sent, but the receipt could not be read: Pay waits while the player's games and USDC are read again. */
export const OutcomeUnknown: Story = { args: { ...PURCHASE.stake1, refusal: UNKNOWN, checking: true, onCheckGames: fn() } };
/** The player confirmed that their balance and games show no purchase: only a deliberate Buy again. */
export const OutcomeUnknownChecked: Story = {
  args: { ...PURCHASE.stake1, refusal: { kind: "unknown", message: "Purchase sent 5 min ago (0x5f1e), outcome unknown. You confirmed that it did not land: Buy again sends a new purchase." }, onCheckGames: fn() },
};
/**
 * The receipt still reads unknown after its re-checks (5, 10 and 20 s): Pay stays held. Check again reads it once more; It
 * did not land is the player's confirm, after reading their balance and games, that offers Buy again.
 */
export const OutcomeUnknownUnresolved: Story = {
  args: {
    ...PURCHASE.stake1,
    refusal: {
      kind: "unknown",
      message:
        "Purchase sent 2 min ago (0x5f1e), outcome unknown: the network does not know it yet. Check your USDC balance and your games: confirm only if they show no purchase, as buying again may pay twice.",
    },
    checkUnresolved: true,
    onCheckGames: fn(),
    onCheckAgain: fn(),
    onConfirmNone: fn(),
  },
};
/** The wallet never answered (5 minutes): no hash, but the send may still land. Held across a reconnect and a reload, as above. */
export const WalletTimedOut: Story = {
  args: {
    ...PURCHASE.stake1,
    refusal: {
      kind: "unknown",
      message:
        "Purchase sent 6 min ago: your wallet did not answer, so it may still go through. Check your USDC balance and your games: confirm only if they show no purchase, as buying again may pay twice.",
    },
    checkUnresolved: true,
    onCheckGames: fn(),
    onCheckAgain: fn(),
    onConfirmNone: fn(),
  },
};
/** The check failed (a read down): Pay stays held; Retry checks again, Dismiss is the deliberate way out, with its warning. */
export const OutcomeUnknownCheckFailed: Story = {
  args: { ...PURCHASE.stake1, refusal: UNKNOWN, checkFailed: true, onCheckGames: fn(), onRetryCheck: fn(), onDismissCheck: fn() },
};
/**
 * The check failed while the purchase may still be answered in the wallet (under its 5 minutes, VALUE-POLISH): Retry only, no
 * Dismiss, so a pending outcome is never forgotten beside an open prompt.
 */
export const OutcomeUnknownCheckFailedWaiting: Story = {
  args: {
    ...PURCHASE.stake1,
    refusal: { kind: "unknown", message: "A purchase is waiting in your wallet (sent just now): it may still go through. Answer it there, or wait, before buying again." },
    checkFailed: true,
    checkDismissable: false,
    onCheckGames: fn(),
    onRetryCheck: fn(),
    onDismissCheck: fn(),
  },
};
/** Retry is fetching: Retry and Dismiss wait for its answer. */
export const OutcomeUnknownRetrying: Story = {
  args: { ...PURCHASE.stake1, refusal: UNKNOWN, checkFailed: true, checkRetrying: true, onCheckGames: fn(), onRetryCheck: fn(), onDismissCheck: fn() },
};
/** A send landed after the page had stopped waiting for it (a switch of account, a timeout): its game waits to be opened. */
export const GameReady: Story = {
  args: { ...PURCHASE.stake1, refusal: { kind: "ready", message: "Your purchase landed: your game is waiting." }, onOpenReady: fn() },
};
/** The receipt of the unknown purchase read since: it went through. */
export const EarlierPurchaseLanded: Story = {
  args: { ...PURCHASE.stake1, refusal: { kind: "landed", message: "Your earlier purchase went through: check your games before buying again." }, onCheckGames: fn() },
};
/** The USDC balance could not be read: unknown, not 0; Pay waits, Retry reads it again. */
export const BalanceUnread: Story = { args: { ...PURCHASE.stake1, balance: null, balanceError: "Cannot reach the node.", onRetryBalance: fn() } };
/** A `?ref=` the contracts would not pay: dropped, said, and the purchase goes on without it. */
export const ReferrerDropped: Story = { args: { ...PURCHASE.stake1, referrerDropped: true } };
