import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea, ScrollBar } from "./scroll-area";
import { Separator } from "./separator";

const meta = { title: "UI/Scroll Area", component: ScrollArea, parameters: { layout: "padded" } } satisfies Meta<typeof ScrollArea>;
export default meta;
type Story = StoryObj<typeof meta>;

const PLAYERS = Array.from({ length: 30 }, (_, i) => `Player ${i + 1}`);

export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-56 w-56 rounded-md border border-input">
      <div className="p-3 text-sm">
        {PLAYERS.map((p) => (
          <div key={p}>
            <div className="py-2">{p}</div>
            <Separator />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-72 rounded-md border border-input whitespace-nowrap">
      <div className="flex gap-3 p-3">
        {PLAYERS.slice(0, 12).map((p) => (
          <div key={p} className="grid size-20 shrink-0 place-items-center rounded-md bg-secondary text-xs">{p}</div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};

/** The viewport takes keyboard focus, so a keyboard user can scroll it. */
export const Focus: Story = { ...Vertical };
