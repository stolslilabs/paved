import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HudDrawer } from "./hud-drawer";

/**
 * The HUD's drawer (PROFILE-DRAWER): a full page with Back on a phone, a side panel docked at the left from `tablet` (the Viewport
 * control), one layout; its body leaves the dock room at its end. The profile is its first content (`Containers/ProfileSheet`).
 */
const meta = {
  title: "Containers/HudDrawer",
  component: HudDrawer,
  args: {
    open: true,
    onOpenChange: fn(),
    title: "Profile",
    children: (
      <p className="text-sm font-bold text-muted-foreground">
        Its content in the phone&apos;s layout at every width; past the screen&apos;s height, it scrolls.
      </p>
    ),
  },
} satisfies Meta<typeof HudDrawer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A short content, at the top of the page. */
export const Short: Story = {};
/** A content taller than the screen: the body scrolls, its last row clear of the dock's room at its end. */
export const Tall: Story = {
  args: {
    children: Array.from({ length: 24 }, (_, i) => (
      <p key={i} className="drawer-raised rounded-xl p-3 text-sm font-bold">
        Row {i + 1}
      </p>
    )),
  },
};
