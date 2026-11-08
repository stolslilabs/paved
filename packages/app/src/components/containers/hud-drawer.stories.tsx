import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { HudDrawer } from "./hud-drawer";

/**
 * The HUD's drawer (PROFILE-DRAWER): a full page with Back on a phone, a side panel docked at its edge from `tablet` (the Viewport
 * control), one layout; its body leaves the dock room at its end. The profile is its first content (`Containers/ProfileSheet`),
 * docked at the left; Missions docks at the right, the Cobbles at its header's end (MISSIONS-PAGE, `Scenes/Missions`).
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

/**
 * Docked at the right (MISSIONS-PAGE), what the page shows at the header's end (`end`): from `tablet` the close on its inner edge,
 * at the left, the end at the right; on a phone Back at the left, the end at the right.
 */
export const RightWithEnd: Story = {
  args: {
    title: "Missions",
    side: "right",
    end: <span className="drawer-carved rounded-full px-3 py-1 text-sm font-bold tabular-nums">640</span>,
  },
};

/**
 * A phone's sheet (`phone="sheet"`, FRIENDS-PAGE: another player's profile, the blocked players): from the bottom on a phone, as tall
 * as its content, its top rounded under the grab bar, the red close at its header's end; from `tablet` the side panel at its edge.
 */
export const PhoneSheet: Story = { args: { title: "Wren of Hollowmere", side: "right", phone: "sheet" } };

/** The drawer's list, a row opening its page in the drawer's place (`inPlace`): Back to the list, at its scroll. */
function InPlaceDemo(props: Parameters<typeof HudDrawer>[0]) {
  const [shown, setShown] = useState<number | null>(null);
  return (
    <HudDrawer {...props} title="Members" side="right">
      {Array.from({ length: 24 }, (_, i) => (
        <button key={i} type="button" onClick={() => setShown(i + 1)} className="drawer-raised cursor-pointer rounded-xl p-3 text-left text-sm font-bold">
          Member {i + 1}
        </button>
      ))}
      <HudDrawer open={shown !== null} onOpenChange={(next) => !next && setShown(null)} title="Profile" side="right" inPlace>
        <p className="text-sm font-bold">Member {shown}&apos;s profile, in the drawer&apos;s place: Back returns to the list as it was.</p>
      </HudDrawer>
    </HudDrawer>
  );
}

/**
 * DRAWER-NAV-IN-PLACE (#1064): a page opened from a drawer (a player's profile, another guild, a list) replaces its content in place,
 * as a navigation: the header shows its title, Back (the header's, Escape) returns to the page it covers, kept under it.
 */
export const PageInPlace: Story = { render: (args) => <InPlaceDemo {...args} /> };
