import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Toaster, toast } from "./sonner";

const meta = { title: "UI/Sonner", component: Toaster, parameters: { layout: "padded" } } satisfies Meta<typeof Toaster>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The mockups' "Tile placed! + 8 points". Press a button; toasts stack and leave on their own. */
export const Toasts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Toaster position="top-center" />
      <Button onClick={() => toast.success("Tile placed!", { description: "+ 8 points" })}>Success</Button>
      <Button variant="secondary" onClick={() => toast("Your turn")}>Default</Button>
      <Button variant="outline" onClick={() => toast.info("Season 3 starts tomorrow")}>Info</Button>
      <Button variant="outline" onClick={() => toast.warning("Connection is slow")}>Warning</Button>
      <Button variant="ghost" onClick={() => toast.promise(new Promise((r) => setTimeout(r, 1500)), { loading: "Sending the move", success: "Move confirmed", error: "Failed" })}>Loading</Button>
    </div>
  ),
};

/** One already on screen, for review without a click. */
export const Shown: Story = {
  render: () => (
    <>
      <Toaster position="top-center" />
      <Button onClick={() => toast.success("Tile placed!", { description: "+ 8 points", duration: Infinity })}>Show</Button>
    </>
  ),
  play: async () => {
    toast.success("Tile placed!", { description: "+ 8 points", duration: Infinity });
  },
};

const Fire = () => (
  <>
    <Toaster position="top-center" />
    <Button onClick={() => toast.success("Tile placed!", { description: "+ 8 points" })}>Place a tile</Button>
  </>
);

/** Reduced motion off: Sonner's toasts slide in and stack on its CSS transitions. */
export const MotionOff: Story = { name: "Toast, reduced motion off", parameters: { reducedMotion: "never" }, render: () => <Fire /> };

/** Reduced motion on: the Toaster takes `toaster-reduced-motion` and `theme.css` cuts the transitions. */
export const MotionOn: Story = { name: "Toast, reduced motion on", parameters: { reducedMotion: "always" }, render: () => <Fire /> };
