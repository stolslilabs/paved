import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HudDrawer } from "./hud-drawer";

/**
 * The HUD's drawer (PROFILE-DRAWER): from the bottom on a phone up to the HUD's end (`top`), a side panel docked at the left under it from
 * `tablet` (the Viewport control), one layout. The profile is its first content (`Containers/ProfileSheet`).
 */
const meta = {
  title: "Containers/HudDrawer",
  component: HudDrawer,
  args: {
    open: true,
    onOpenChange: fn(),
    title: "Your profile",
    top: 200,
    children: (
      <p className="text-sm font-bold text-muted-foreground">
        Its content in the phone&apos;s layout at every width; past the room under the HUD, it scrolls.
      </p>
    ),
  },
} satisfies Meta<typeof HudDrawer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A short content: the drawer hugs it, its top below the HUD's end. */
export const Short: Story = {};
/** A content taller than the room: the drawer stops at the HUD's end and its body scrolls. */
export const Tall: Story = {
  args: {
    children: Array.from({ length: 24 }, (_, i) => (
      <p key={i} className="drawer-raised rounded-xl p-3 text-sm font-bold">
        Row {i + 1}
      </p>
    )),
  },
};
/** With no HUD measured: its top stops under a page's header. */
export const NoHud: Story = { args: { top: undefined } };
