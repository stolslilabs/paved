import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta = { title: "UI/Popover", component: Popover, parameters: { layout: "padded" } } satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

const Demo = ({ open }: { open?: boolean }) => (
  <div className="p-16">
    <Popover open={open}>
      <PopoverTrigger asChild>
        <Button variant="outline">Open</Button>
      </PopoverTrigger>
      <PopoverContent>Your village is shielded: no one can attack it.</PopoverContent>
    </Popover>
  </div>
);

export const Open: Story = { render: () => <Demo open /> };
export const Tap: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open" }));
    await expect(await screen.findByRole("dialog")).toHaveTextContent("no one can attack it");
  },
};
