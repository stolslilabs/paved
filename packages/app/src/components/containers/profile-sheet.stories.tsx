import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PROFILE } from "../../mocks/scenes";
import { ProfileSheet } from "./profile-sheet";

/** What a tap on the avatar opens (#624): a bottom sheet on a phone, a panel from the left from `desktop` (the Viewport control). */
const meta = {
  title: "Containers/ProfileSheet",
  component: ProfileSheet,
  args: { open: true, state: PROFILE.connected, onOpenChange: fn(), onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}) },
} satisfies Meta<typeof ProfileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The avatar larger, the name, the address with Copy, the figures, Edit avatar (soon, #626), Disconnect. */
export const Connected: Story = {};
export const NoUsername: Story = { args: { state: PROFILE.noUsername } };
/** A guest: the Training line and Connect. */
export const Guest: Story = { args: { state: PROFILE.guest } };
export const Connecting: Story = { args: { state: PROFILE.connecting } };
export const Loading: Story = { args: { state: PROFILE.loading } };
/** WRAP360: the longest name, the largest figures. */
export const Stress: Story = { args: { state: PROFILE.stress } };
