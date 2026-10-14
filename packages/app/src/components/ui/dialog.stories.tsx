import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";

const meta = { title: "UI/Dialog", component: Dialog, parameters: { layout: "padded" } } satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const Surrender = ({ defaultOpen }: { defaultOpen?: boolean }) => (
  <Dialog defaultOpen={defaultOpen}>
    <DialogTrigger asChild>
      <Button variant="destructive">Give up</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Give up this game?</DialogTitle>
        <DialogDescription>Your score so far is kept, and the game ends.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Keep playing</Button>
        </DialogClose>
        <Button variant="destructive">Give up</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const Closed: Story = { render: () => <Surrender /> };

/** Open: focus is trapped in the panel, Escape closes it. */
export const Open: Story = { render: () => <Surrender defaultOpen /> };

export const OpenedByKeyboard: Story = {
  render: () => <Surrender />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep playing" })).toBeInTheDocument();
    void canvasElement;
  },
};
