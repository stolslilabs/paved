import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ModeCard } from "./mode-card";
import { LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

const meta = {
  title: "Containers/ModeCard",
  component: ModeCard,
  parameters: { layout: "padded" },
  args: { icon: "play", title: "Training", description: "A full game for free.", badge: "Free", onSelect: fn() },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof ModeCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Featured: Story = { args: { featured: true, icon: "trophy", title: "Challenge", badge: "Paid", description: "Stake, beat the threshold, earn PAVED." } };
/** Multiplayer: out of v1 (owner D-4). */
export const ComingSoon: Story = { args: { icon: "user-group", title: "Multiplayer", description: "Play with your friends in real time.", badge: "Coming soon", disabled: true } };
export const DisabledWithReason: Story = {
  args: { featured: true, icon: "trophy", title: "Challenge", badge: "Paid", description: "Stake, beat the threshold, earn PAVED.", disabled: true, reason: "Purchases are paused for now." },
};
export const WithContent: Story = {
  args: {
    featured: true,
    icon: "trophy",
    title: "Challenge",
    badge: "Paid",
    description: "Stake, beat the threshold, earn PAVED.",
    children: <p className="text-xs text-primary">Connect a wallet to enter: tap to connect.</p>,
  },
};
/** WRAP360: a long title and badge, a description with an unbroken compound, a long reason; the icon stays at the top. */
export const Stress: Story = {
  args: { featured: true, icon: "trophy", title: LONG_LABEL, badge: "Coming soon", description: `${LONG_SENTENCE} ${LONG_WORD}`, disabled: true, reason: LONG_SENTENCE },
};
