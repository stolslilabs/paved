import type { Meta, StoryObj } from "@storybook/react-vite";
import { BIG_NUMBER } from "../../mocks/stress";
import { Gems } from "./gems";

const meta = { title: "Elements/Gems", component: Gems, parameters: { layout: "padded" }, args: { value: 240 } } satisfies Meta<typeof Gems>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** None yet: a new player's balance. */
export const Zero: Story = { args: { value: 0 } };
/** A quest's or an achievement's reward. */
export const Reward: Story = { args: { value: 15, sign: "+", size: "sm" } };
export const Large: Story = { args: { value: 1_000, size: "lg" } };

/** The three sizes. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <Gems key={size} size={size} value={1_580} />
      ))}
    </div>
  ),
};
/** WRAP360: the widest balance at each size. */
export const Stress: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <Gems key={size} size={size} value={BIG_NUMBER} />
      ))}
    </div>
  ),
};
