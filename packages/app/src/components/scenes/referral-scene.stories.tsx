import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { REFERRAL } from "../../mocks/scenes";
import { ReferralScene } from "./referral-scene";
import { at } from "./viewports";

/** Referral (`/referral`): the player's link to copy, their share of each price (500 bps, out of the Vault's part) and what it earned. Each state at the four viewports. */
const meta = { title: "Scenes/Referral", component: ReferralScene, args: { onCopy: fn(), onConnect: fn(), onBack: fn(), onNavigate: fn() } } satisfies Meta<typeof ReferralScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nine purchases through the link. */
const earned: Story = { args: REFERRAL.earned };
export const EarnedMobile: Story = at("mobile", earned);
export const EarnedTablet: Story = at("tablet", earned);
export const EarnedDesktop: Story = at("desktop", earned);
export const EarnedWide: Story = at("wide", earned);

/** The link just copied. */
const copied: Story = { args: REFERRAL.copied };
export const CopiedMobile: Story = at("mobile", copied);
export const CopiedTablet: Story = at("tablet", copied);
export const CopiedDesktop: Story = at("desktop", copied);
export const CopiedWide: Story = at("wide", copied);

/** Nobody bought through the link yet. */
const none: Story = { args: REFERRAL.none };
export const NothingYetMobile: Story = at("mobile", none);
export const NothingYetTablet: Story = at("tablet", none);
export const NothingYetDesktop: Story = at("desktop", none);
export const NothingYetWide: Story = at("wide", none);

/** The earnings on their way. */
const loading: Story = { args: REFERRAL.loading };
export const LoadingMobile: Story = at("mobile", loading);
export const LoadingTablet: Story = at("tablet", loading);
export const LoadingDesktop: Story = at("desktop", loading);
export const LoadingWide: Story = at("wide", loading);

/** No wallet: no link. */
const guest: Story = { args: REFERRAL.guest };
export const GuestMobile: Story = at("mobile", guest);
export const GuestTablet: Story = at("tablet", guest);
export const GuestDesktop: Story = at("desktop", guest);
export const GuestWide: Story = at("wide", guest);

/** No economy on this network: no share shown. */
const notDeployed: Story = { args: REFERRAL.notDeployed };
export const NotDeployedMobile: Story = at("mobile", notDeployed);
export const NotDeployedTablet: Story = at("tablet", notDeployed);
export const NotDeployedDesktop: Story = at("desktop", notDeployed);
export const NotDeployedWide: Story = at("wide", notDeployed);
