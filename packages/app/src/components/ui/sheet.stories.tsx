import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, waitFor } from "storybook/test";
import { dragDown } from "../../stories/sheet-drag";
import { Button } from "./button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "./sheet";

const meta = { title: "UI/Sheet", component: Sheet, parameters: { layout: "padded" } } satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const Demo = ({ side, defaultOpen }: { side: "top" | "right" | "bottom" | "left"; defaultOpen?: boolean }) => (
  <Sheet defaultOpen={defaultOpen}>
    <SheetTrigger asChild>
      <Button variant="outline">Open {side}</Button>
    </SheetTrigger>
    <SheetContent side={side}>
      <SheetHeader>
        <SheetTitle>Your hand</SheetTitle>
        <SheetDescription>Three tiles, pick one to place.</SheetDescription>
      </SheetHeader>
      <SheetFooter>
        <SheetClose asChild>
          <Button variant="secondary">Close</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

/**
 * The bottom sheet is the mobile drawer of section 3.1. It slides in and out with Motion; reduced motion keeps the fade.
 * The grab bar at its top says it drags down to close (#581).
 */
export const Bottom: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <Demo side="bottom" defaultOpen /> };
export const Right: Story = { render: () => <Demo side="right" defaultOpen /> };
export const Left: Story = { render: () => <Demo side="left" defaultOpen /> };
export const Top: Story = { render: () => <Demo side="top" defaultOpen /> };
export const Closed: Story = { render: () => <Demo side="bottom" /> };

/** Reduced motion off: the panel slides in from its edge on a spring, and out on close. */
export const MotionOff: Story = { name: "Slide, reduced motion off", parameters: { reducedMotion: "never" }, render: () => <Demo side="bottom" /> };

/** Reduced motion on: no slide, the overlay's fade only. */
export const MotionOn: Story = { name: "Slide, reduced motion on", parameters: { reducedMotion: "always" }, render: () => <Demo side="bottom" /> };

const grabBar = () => document.querySelector("[data-slot=sheet-grab-bar]")!;
const mobile = { viewport: { defaultViewport: "mobile1" }, reducedMotion: "never" as const };

/** Dragging (#581): the panel follows the finger from the grab bar, short of the threshold; held there. */
export const Dragging: Story = {
  parameters: mobile,
  render: () => <Demo side="bottom" defaultOpen />,
  play: async () => {
    await dragDown(grabBar(), 40, { hold: true });
    await expect(screen.getByRole("dialog")).toHaveAttribute("data-dragging");
  },
};

/** Released short of the threshold: the panel springs back to its place. */
export const SpringBack: Story = {
  parameters: mobile,
  render: () => <Demo side="bottom" defaultOpen />,
  play: async () => {
    await dragDown(grabBar(), 30);
    await expect(screen.getByRole("dialog")).toBeInTheDocument();
    await expect(screen.getByRole("dialog").style.translate).toBe("");
  },
};

/** Released past the threshold (a quarter of the height, 120 px at most): the sheet slides away from where it was. */
export const Closing: Story = {
  parameters: mobile,
  render: () => <Demo side="bottom" defaultOpen />,
  play: async () => {
    await dragDown(grabBar(), 120);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

/** Reduced motion on: the same drag closes at once, with no slide and no spring. */
export const ClosingReducedMotion: Story = {
  name: "Closing, reduced motion on",
  parameters: { ...mobile, reducedMotion: "always" },
  render: () => <Demo side="bottom" defaultOpen />,
  play: async () => {
    await dragDown(grabBar(), 120);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
