import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ACHIEVEMENTS } from "../../mocks/scenes";
import { AchievementsScene } from "./achievements-scene";

/** The achievements (`/missions/lifetime`, the Lifetime tab): earned, in progress and locked. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Missions (Lifetime)", component: AchievementsScene, args: { onTab: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn(), onClaim: fn(), onClaimAll: fn() } } satisfies Meta<typeof AchievementsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four earned, six in progress, six locked (the sixteen: the accepted list and v2a's higher tiers). */
export const Mixed: Story = { args: ACHIEVEMENTS.mixed };

/** Nothing counted yet: all locked. */
export const NewPlayer: Story = { args: ACHIEVEMENTS.newPlayer };

/** Every one earned. */
export const AllEarned: Story = { args: ACHIEVEMENTS.all };

/** No wallet: Connect. */
export const Guest: Story = { args: ACHIEVEMENTS.guest };

/** The achievements on their way. */
export const Loading: Story = { args: ACHIEVEMENTS.loading };
/** The read failed: the one error component, with Retry and Copy (P-67). */
export const Failed: Story = { args: ACHIEVEMENTS.failed };
/** P-61: each achievement's Cobbles (its points): two claimed, two to claim (Claim per row, Claim all); On the Podium gives none. */
export const Cobbles: Story = { args: ACHIEVEMENTS.cobbles };
/** Claim all on its way. */
export const CobblesClaiming: Story = { args: ACHIEVEMENTS.cobblesClaiming };
/** Every one earned and its Cobbles claimed. */
export const CobblesAllClaimed: Story = { args: ACHIEVEMENTS.cobblesAllClaimed };
/** P9: no wallet to sign yet (P6): the rewards show, the claims ask to connect. */
export const CobblesReadOnly: Story = { args: { ...ACHIEVEMENTS.cobbles, canClaim: false } };
