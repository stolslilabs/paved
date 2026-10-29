import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { WalkControls } from "./walk-controls";

/**
 * The first-person walk's overlay (V4-WALK-1, #876), one story per state, over a plain box in the board's place (the walk itself
 * is in `Renderer/Walk`). Touch: Exit and the two sticks. Desktop: Exit and a line of help, whether the mouse is locked or free.
 */
const meta = {
  title: "Containers/WalkControls",
  component: WalkControls,
  parameters: { layout: "fullscreen" },
  args: { input: "touch", phase: "walking", onExit: fn(), onMove: fn(), onLook: fn() },
  decorators: [
    (Story) => (
      // Inline styles: a story class the app does not use would grow the app's CSS (Tailwind scans the stories).
      <div style={{ position: "relative", height: "100dvh", background: "var(--muted)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WalkControls>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The walk's ground is being built (its chunk, the voxels): Exit already works. */
export const Loading: Story = { args: { phase: "loading" } };
/** The eased descent from the orbit view: no stick until the walker stands. */
export const Entering: Story = { args: { phase: "entering" } };
/** Touch: the move stick at the bottom left, the look stick at the bottom right. */
export const Touch: Story = {};
/** Desktop, the mouse free: a click locks it to the look. */
export const DesktopFree: Story = { args: { input: "desktop" } };
/** Desktop, the mouse locked: Escape frees it. */
export const DesktopLocked: Story = { args: { input: "desktop", mouseLocked: true } };
/** The lift back to the view it came from: Exit is spent. */
export const Leaving: Story = { args: { phase: "leaving" } };
