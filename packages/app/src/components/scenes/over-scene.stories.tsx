import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DAY, MOCK_NOW } from "../../mocks/clock";
import { OVER } from "../../mocks/scenes";
import { OverScene } from "./over-scene";

/** The end of a game: final score, metrics, every closing (P7), the reward or its absence. One story per state; the Viewport control reframes it. */
const meta = { title: "Scenes/Over", component: OverScene, args: { onSettle: fn(), onPlayAgain: fn(), onHome: fn() } } satisfies Meta<typeof OverScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The final board (#539): the scores one tap away, the board panned and zoomed, no hand. */
export const FinalBoard: Story = { args: OVER.finalBoard };

/** No board to show (its tiles could not be read): no toggle, the closings' figures alone. */
export const NoBoard: Story = { args: OVER.noBoard };

/** Above the threshold, settled: the reward minted; a new best. */
export const Rewarded: Story = { args: OVER.rewarded };

/** Recorded, its day still open. */
export const AwaitingTheDay: Story = { args: OVER.awaiting };

export const ReadyToSettle: Story = { args: OVER.settle };

/** Under the threshold: the stake lost. */
export const BelowThreshold: Story = { args: OVER.below };

/** Not finished within 24 h of the purchase. */
export const Expired: Story = { args: OVER.expired };

// The Challenge's settle area (P7a): the clock is fixed so a story reads the same everywhere (the dates are UTC).
const settling = { ...OVER.awaiting, now: MOCK_NOW } as const;

/** The day cannot be settled yet: "Settles in <time> (<date> UTC)". */
export const SettlesAfter: Story = { args: { ...settling, settle: { state: "after", at: MOCK_NOW + 14 * 3600 + 5 * 60 } } };

/** A guest: connect first. */
export const ConnectToSettle: Story = { args: { ...settling, settle: { state: "connect" } } };

/** The player's button, the day closed. */
export const SettleButton: Story = { args: { ...settling, settle: { state: "ready" } } };

/** Someone else's game: it can be settled, and the button is the player's. */
export const SettleForAnotherPlayer: Story = { args: { ...settling, settle: { state: "viewing" } } };

/** Sent: the wallet and the chain. */
export const SettlePending: Story = { args: { ...settling, settle: { state: "pending" } } };

/** The chain refused it: why, and the button again. */
export const SettleRefused: Story = { args: { ...settling, settle: { state: "refused", message: "This day cannot be settled yet: try again after the next day ends." } } };

/** Settled from this page: the reward, then the label. */
export const JustSettled: Story = { args: { ...OVER.rewarded, settle: { state: "settled" } } };

/** Settled earlier. */
export const AlreadySettled: Story = { args: { ...OVER.rewarded, settle: { state: "done" } } };

/** Not finished within 24 h: the deadline it missed. */
export const ExpiredWithDeadline: Story = { args: { ...OVER.expired, now: MOCK_NOW, deadline: MOCK_NOW - 3_600 } };

/** A free Challenge game (PLAYFREE): the label, no reward, nothing to settle. */
export const FreeGame: Story = { args: { ...OVER.awaiting, freeGame: true, reward: { state: "free" } } };

/** The closings could not be read: the rest of the page stands. */
export const ClosingsUnavailable: Story = { args: { ...OVER.awaiting, closings: [], closingsNote: "The closings of this game could not be read." } };

/** Training: no stake, no reward. */
export const Training: Story = { args: OVER.training };

/** Nothing closed: the list says so. */
export const NoClosing: Story = { args: OVER.noClosing };
/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: OVER.stress };

/** WRAP360: the longest relative time ("41 d 15 h") with the UTC date, in a sentence. */
export const SettlesAfterStress: Story = { args: { ...settling, settle: { state: "after", at: MOCK_NOW + 999 * 3600 + 59 * 60 } } };
