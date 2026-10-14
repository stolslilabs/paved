import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

const meta = { title: "UI/Tooltip", component: Tooltip, parameters: { layout: "padded" } } satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

const Demo = ({ open, side }: { open?: boolean; side?: "top" | "right" | "bottom" | "left" }) => (
  <TooltipProvider delayDuration={0}>
    <div className="p-16">
      <Tooltip open={open}>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent side={side}>Rotate the tile with R</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);

export const Open: Story = { render: () => <Demo open /> };
export const Sides: Story = {
  render: () => (
    <div className="flex gap-24 p-16">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <TooltipProvider key={side}>
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">{side}</Button>
            </TooltipTrigger>
            <TooltipContent side={side}>{side}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  ),
};

export const Hover: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button"));
    await expect((await screen.findAllByText("Rotate the tile with R"))[0]).toBeInTheDocument();
  },
};

/** Keyboard focus opens it too. */
export const Focus: Story = {
  render: () => <Demo />,
  play: async () => {
    await userEvent.tab();
    await expect((await screen.findAllByText("Rotate the tile with R"))[0]).toBeInTheDocument();
  },
};
