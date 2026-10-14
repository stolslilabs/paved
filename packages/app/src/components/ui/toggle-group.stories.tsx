import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

// No `component`: the group's props are a union (single or multiple), which Storybook's args cannot require.
const meta = { title: "UI/Toggle Group", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const Levels = (props: Partial<React.ComponentProps<typeof ToggleGroup>> & { disabled?: boolean }) => (
  <ToggleGroup type="single" defaultValue="medium" aria-label="Difficulty" variant="outline" {...(props as object)}>
    <ToggleGroupItem value="easy">Easy</ToggleGroupItem>
    <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
    <ToggleGroupItem value="hard">Hard</ToggleGroupItem>
  </ToggleGroup>
);

/** The mockups' Easy / Medium / Hard and Low / Medium / High: outlined, one choice. */
export const Outline: Story = { render: () => <Levels /> };
export const Plain: Story = { render: () => <Levels variant="default" /> };
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Levels size="sm" />
      <Levels />
      <Levels size="lg" />
    </div>
  ),
};
export const Multiple: Story = {
  render: () => (
    <ToggleGroup type="multiple" variant="outline" aria-label="Show" defaultValue={["roads"]}>
      <ToggleGroupItem value="roads">Roads</ToggleGroupItem>
      <ToggleGroupItem value="rivers">Rivers</ToggleGroupItem>
      <ToggleGroupItem value="meadows">Meadows</ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Hover: Story = {
  render: () => <Levels />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("radio", { name: "Hard" }));
  },
};

/** Tab lands on the selected item; the arrow keys move between items. */
export const Focus: Story = {
  render: () => <Levels />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("radio", { name: "Medium" })).toHaveFocus();
  },
};

export const Disabled: Story = {
  render: () => <Levels disabled />,
};
