import type { Meta, StoryObj } from "@storybook/react-vite";
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

/** The bottom sheet is the mobile drawer of section 3.1. It slides in and out with Motion; reduced motion keeps the fade. */
export const Bottom: Story = { render: () => <Demo side="bottom" defaultOpen /> };
export const Right: Story = { render: () => <Demo side="right" defaultOpen /> };
export const Left: Story = { render: () => <Demo side="left" defaultOpen /> };
export const Top: Story = { render: () => <Demo side="top" defaultOpen /> };
export const Closed: Story = { render: () => <Demo side="bottom" /> };

/** Reduced motion off: the panel slides in from its edge on a spring, and out on close. */
export const MotionOff: Story = { name: "Slide, reduced motion off", parameters: { reducedMotion: "never" }, render: () => <Demo side="bottom" /> };

/** Reduced motion on: no slide, the overlay's fade only. */
export const MotionOn: Story = { name: "Slide, reduced motion on", parameters: { reducedMotion: "always" }, render: () => <Demo side="bottom" /> };
