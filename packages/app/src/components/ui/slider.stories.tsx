import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Slider } from "./slider";

const meta = { title: "UI/Slider", component: Slider, parameters: { layout: "padded" }, decorators: [(Story) => <div className="max-w-sm"><Story /></div>] } satisfies Meta<typeof Slider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { defaultValue: [40], "aria-label": "Volume" } };
export const Range: Story = { args: { defaultValue: [20, 70], "aria-label": "Range" } };
export const Stepped: Story = { args: { defaultValue: [50], step: 25, "aria-label": "Steps" } };

export const Hover: Story = {
  args: { defaultValue: [40], "aria-label": "Volume" },
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("slider"));
  },
};

/** Focus, then the arrow keys move the thumb. */
export const Focus: Story = {
  args: { defaultValue: [40], "aria-label": "Volume" },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const thumb = within(canvasElement).getByRole("slider");
    await expect(thumb).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(thumb).toHaveAttribute("aria-valuenow", "41");
  },
};

export const Disabled: Story = { args: { defaultValue: [40], disabled: true, "aria-label": "Volume" } };
