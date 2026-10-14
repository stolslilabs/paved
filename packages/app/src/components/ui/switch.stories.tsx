import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Switch } from "./switch";

const meta = { title: "UI/Switch", component: Switch, parameters: { layout: "padded" } } satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

const Labelled = (props: React.ComponentProps<typeof Switch>) => (
  <label className="flex items-center gap-3 text-sm">
    <Switch {...props} />
    Sound effects
  </label>
);

export const Off: Story = { render: () => <Labelled /> };
export const On: Story = { render: () => <Labelled defaultChecked /> };

export const Hover: Story = {
  render: () => <Labelled />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("switch"));
  },
};

export const Focus: Story = {
  render: () => <Labelled />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("switch")).toHaveFocus();
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Labelled disabled />
      <Labelled disabled defaultChecked />
    </div>
  ),
};
