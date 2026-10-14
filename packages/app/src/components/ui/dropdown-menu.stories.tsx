import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, within } from "storybook/test";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const meta = { title: "UI/Dropdown Menu", component: DropdownMenu, parameters: { layout: "padded" } } satisfies Meta<typeof DropdownMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

const Demo = ({ defaultOpen }: { defaultOpen?: boolean }) => {
  const [sound, setSound] = useState(true);
  const [speed, setSpeed] = useState("normal");
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Game</DropdownMenuLabel>
        <DropdownMenuItem>Rotate<DropdownMenuShortcut>R</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem disabled>Undo</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={sound} onCheckedChange={setSound}>Sound</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value={speed} onValueChange={setSpeed}>
          <DropdownMenuRadioItem value="normal">Normal</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fast">Fast</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Rules</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem variant="destructive">Give up</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const Closed: Story = { render: () => <Demo /> };
export const Open: Story = { render: () => <Demo defaultOpen /> };

/** Keyboard: Tab to the trigger, Enter opens, the arrow keys move the highlight (the focus state). */
export const Focus: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("button", { name: "Menu" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(await screen.findByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
  },
};
