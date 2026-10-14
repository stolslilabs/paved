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

/** The indicator slides to the active tab (Motion spring); under reduced motion it jumps. */
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

export const DisabledTab: Story = { render: () => <Demo disabled /> };

/** Reduced motion off: the highlight (motion-primitives AnimatedBackground, a shared `layoutId`) springs to the new tab. */
export const MotionOff: Story = {
  name: "Highlight, reduced motion off",
  parameters: { reducedMotion: "never" },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("tab", { name: "Season" }));
  },
};

/** Reduced motion on: Motion makes the layout animation instant, the highlight jumps. */
export const MotionOn: Story = {
  name: "Highlight, reduced motion on",
  parameters: { reducedMotion: "always" },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("tab", { name: "Season" }));
  },
};
