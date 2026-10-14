import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { REFERRAL } from "../../mocks/scenes";
import { ReferralScene } from "./referral-scene";

/** Referral (`/referral`): the player's link to copy, their share of each price (500 bps, out of the Vault's part) and what it earned. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Referral", component: ReferralScene, args: { onCopy: fn(), onConnect: fn(), onBack: fn(), onNavigate: fn() } } satisfies Meta<typeof ReferralScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nine purchases through the link. */
export const Earned: Story = { args: REFERRAL.earned };

/** The link just copied. */
export const Copied: Story = { args: REFERRAL.copied };

/** Nobody bought through the link yet. */
export const NothingYet: Story = { args: REFERRAL.none };

/** The earnings on their way. */
export const Loading: Story = { args: REFERRAL.loading };

/** No wallet: no link. */
export const Guest: Story = { args: REFERRAL.guest };

/** No economy on this network: no share shown. */
export const NotDeployed: Story = { args: REFERRAL.notDeployed };
