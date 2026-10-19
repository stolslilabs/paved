import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = { title: "UI/Tabs", component: Tabs, parameters: { layout: "padded" } } satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

const Demo = ({ disabled = false }: { disabled?: boolean }) => (
  <Tabs defaultValue="daily" className="max-w-sm">
    <TabsList>
      <TabsTrigger value="daily">Daily</TabsTrigger>
      <TabsTrigger value="weekly">Weekly</TabsTrigger>
      <TabsTrigger value="season" disabled={disabled}>Season</TabsTrigger>
    </TabsList>
    <TabsContent value="daily">Daily ranks.</TabsContent>
    <TabsContent value="weekly">Weekly ranks.</TabsContent>
    <TabsContent value="season">Season ranks.</TabsContent>
  </Tabs>
);

/** The indicator slides to the active tab (a transform transition); under reduced motion it jumps. */
export const Default: Story = { render: () => <Demo /> };

export const Hover: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("tab", { name: "Weekly" }));
  },
};

export const Focus: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("tab", { name: "Daily" })).toHaveFocus();
  },
};

export const SecondSelected: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("tab", { name: "Weekly" }));
  },
};

/** Hover on the tab beside the active one: the gap keeps the hover layer off the active fill. */
export const HoverBesideActive: Story = {
  render: () => (
    <Tabs defaultValue="daily">
      <TabsList>
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="weekly" data-force="hover">Weekly</TabsTrigger>
        <TabsTrigger value="season">Season</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
};

/** Labels of unequal length: every column takes the widest one, so switching never changes the list's footprint. */
export const SameSize: Story = {
  render: () => (
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Tiles</TabsTrigger>
        <TabsTrigger value="b">Milestones and more</TabsTrigger>
        <TabsTrigger value="c">Themes</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("tablist");
    const tabs = within(canvasElement).getAllByRole("tab");
    const widths = tabs.map((t) => t.getBoundingClientRect().width);
    await expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
    const before = list.getBoundingClientRect().width;
    await userEvent.click(tabs[1]!);
    await expect(list.getBoundingClientRect().width).toBe(before);
  },
};

/** Full width (a phone): the columns share the width equally. */
export const FullWidth: Story = {
  render: () => (
    <Tabs defaultValue="daily">
      <TabsList className="w-full">
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="weekly">Weekly</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
};

export const DisabledTab: Story = { render: () => <Demo disabled /> };

/** Reduced motion off: the one indicator moves to the new tab with a transform transition (200 ms). */
export const MotionOff: Story = {
  name: "Highlight, reduced motion off",
  parameters: { reducedMotion: "never" },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const season = within(canvasElement).getByRole("tab", { name: "Season" });
    await userEvent.click(season);
    const indicator = canvasElement.querySelector<HTMLElement>('[data-slot="tabs-indicator"]')!;
    await expect(indicator.dataset.animate).toBe("true");
    await expect(indicator.style.transform).toBe(`translateX(${season.offsetLeft}px)`);
  },
};

/** Reduced motion on: no transition, the indicator jumps. */
export const MotionOn: Story = {
  name: "Highlight, reduced motion on",
  parameters: { reducedMotion: "always" },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("tab", { name: "Season" }));
    await expect(canvasElement.querySelector<HTMLElement>('[data-slot="tabs-indicator"]')!.dataset.animate).toBe("false");
  },
};
