import type { Meta, StoryObj } from "@storybook/react-vite";
import { Score } from "./score";
import { BIG_SCORE } from "../../mocks/stress";

const meta = { title: "Elements/Score", component: Score, parameters: { layout: "padded" }, args: { value: 1240, label: "Score" } } satisfies Meta<typeof Score>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Gold: Story = { args: { tone: "gold", size: "lg" } };
/** The points the last move added, beside the score. */
export const WithDelta: Story = { args: { value: 1380, delta: 140 } };
/** The points a placed tile would score (#568): beside the value, in brackets, distinct from the green gain. */
export const WithPreview: Story = { args: { value: 1000, preview: 154 } };
export const Final: Story = { args: { value: 4820, size: "xl", tone: "gold", label: "Your score" } };
export const Zero: Story = { args: { value: 0 } };

/** The four sizes, tabular figures: the digits line up from one row to the next. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <Score key={size} size={size} value={size === "sm" ? 111 : 1888} label={size} />
      ))}
    </div>
  ),
};
/** WRAP360: a score beyond any real game at each size, with a gain. */
export const Stress: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["sm", "hud", "md", "lg", "xl"] as const).map((size) => (
        <Score key={size} value={BIG_SCORE} delta={9_999} size={size} label="Score" icon="star" />
      ))}
    </div>
  ),
};
