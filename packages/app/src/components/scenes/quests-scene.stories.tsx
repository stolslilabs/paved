import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QUESTS } from "../../mocks/scenes";
import { QuestsScene } from "./quests-scene";

/**
 * The quests (`/missions/:day?`, Limited) as milestone tracks (#595): a Daily and a Weekly section with their countdowns, one card
 * per track, its steps and their Cobbles; the day picker. The completion toasts are the app's (Containers/CompletionToasts).
 * One story per state; the viewport is the toolbar's (VP).
 */
const meta = { title: "Scenes/Missions (Limited)", component: QuestsScene, args: { onDayChange: fn(), onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn(), onClaim: fn(), onClaimAll: fn(), onClaimCredit: fn(), onPlayFree: fn() } } satisfies Meta<typeof QuestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today (Wednesday): Daily Run and the three of the rotation (offset 1), Daily Run done, and the week's three. Daily counts down to 00:00 UTC, Weekly to Monday 00:00 UTC. */
export const Today: Story = { args: QUESTS.today };

/** Yesterday, closed: Daily Run and the rotation's offset 0 (Small Works, Woodland Walk, Warm-Up Score), all four dailies done; the weeklies are where they stood that day. No countdown on a closed day. */
export const AllComplete: Story = { args: QUESTS.allDone };

/** A past day the player did not play. */
export const NotPlayed: Story = { args: QUESTS.idle };

/** A day before the quests were defined: none live. */
export const NoQuest: Story = { args: QUESTS.none };

/** A weekly quest complete (Weekly Forester, 5 of 5). */
export const WeeklyDone: Story = { args: QUESTS.weeklyDone };

/** Four minutes before 00:00 UTC: the Daily countdown is amber. */
export const EndingSoon: Story = { args: QUESTS.endingSoon };

/** No wallet: Connect. */
export const Guest: Story = { args: QUESTS.guest };

/** The day's quests on their way. */
export const Loading: Story = { args: QUESTS.loading };

/** The indexer did not answer. */
export const Failed: Story = { args: QUESTS.error };

/** P-61: today with Cobbles: Daily Run's 5 to claim, what each quest gives, the day's and the week's free game to earn. */
export const CobblesToday: Story = { args: QUESTS.cobblesToday };

/** Daily Run's Cobbles claimed. */
export const CobblesClaimed: Story = { args: QUESTS.cobblesClaimed };

/** Yesterday, closed and still claimable (no deadline): the four dailies' 20 Cobbles, Claim all, and the day's free game. */
export const CobblesPastDay: Story = { args: QUESTS.cobblesPastDay };

/** Claim all on its way. */
export const CobblesClaiming: Story = { args: QUESTS.cobblesClaiming };

/** Everything of yesterday claimed: a free game to play. */
export const CobblesFreeGame: Story = { args: QUESTS.cobblesFreeGame };

/** The three weeklies done: their Cobbles and the week's free game to claim. */
export const CobblesWeekDone: Story = { args: QUESTS.cobblesWeekDone };

/** P9: the player is known but has no wallet to sign yet (P6): the rewards show, the claims ask to connect. */
export const CobblesReadOnly: Story = { args: { ...QUESTS.cobblesPastDay, canClaim: false } };

/** #595, the tiered schedule (a proposal): each family one bar of three steps; reached steps to claim glow, claimed ones check, the next is lit, the rest locked. */
export const Tiered: Story = { args: QUESTS.tiered };

/** The tiered schedule before any game: the first step of each track next. */
export const TieredFresh: Story = { args: QUESTS.tieredFresh };

/** Every step reached and claimed, both free games claimed. */
export const TieredClaimed: Story = { args: QUESTS.tieredClaimed };

/** The tiered bars without Cobbles: steps check when reached, no reward drawn. */
export const TieredNoRewards: Story = { args: QUESTS.tieredNoRewards };

/** A mission of several tasks: each task keeps its bar (roads and cities 4 of 4, forests 0 of 2), in progress until both are done. */
export const MultiTask: Story = { args: QUESTS.multiTask };
