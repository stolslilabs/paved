import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import type { Tab } from "../../routes/pages";
import { PHONE_320, PHONE_375, TABLET_768, WIDE_1440 } from "../scenes/viewports";
import { AppNav } from "./app-nav";

/** Every story keeps its own active tab: a click moves it, so the white states and the gold of the current item can be checked. `active` is the starting tab. */
function Stateful({ active, onNavigate, ...args }: React.ComponentProps<typeof AppNav>) {
  const [current, setCurrent] = useState<Tab | null>(active);
  useEffect(() => setCurrent(active), [active]);
  return (
    <AppNav
      {...args}
      active={current}
      onNavigate={(tab) => {
        setCurrent(tab);
        onNavigate?.(tab);
      }}
    />
  );
}

const meta = {
  title: "Containers/AppNav",
  component: AppNav,
  args: { active: "shop", onNavigate: fn() },
  render: (args) => <Stateful {...args} />,
  decorators: [(Story) => <div className="flex min-h-[20rem] flex-col justify-end desktop:justify-start"><Story /></div>],
} satisfies Meta<typeof AppNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Direction D (#537): the bottom bar on a phone; from 1024 px (the theme's `desktop`) a header across the top, the voxel
 * wordmark, the items icon beside label. The Viewport control switches between them. The current item is gold on the white
 * 15% layer; hover is 10%, a press 20%. TAB-SWIPE (#726): on a phone the items are icons and only the current one shows its
 * label; a click here slides the highlight to the new item, folds the old label and unfolds the new one (the bar stays
 * mounted: plain transitions; in the app each page mounts its own bar, which starts from the last one's state). None under
 * reduced motion. PHONE-NAV (#763): the bar holds Shop, Chests, Play, League, Settings; Play, in the centre, has no label: a
 * gold disc raised above the bar, and no highlight. The desktop header is unchanged until #762: Home, Missions, Vault,
 * Settings. One story per item of the bar active.
 */
export const Default: Story = {};

/** Starts on Chests, with 3 chests waiting (its badge). */
export const ActiveChests: Story = { args: { active: "chests", badges: { chests: 3 } } };

/** Play active: it never is in the app (the mode choice is a full-screen page, without the bar), shown for the states. Phone only: the desktop header has no Play (#668). */
export const ActivePlay: Story = { args: { active: "play" } };

/** Starts on League (the league page and its defence log). */
export const ActiveLeague: Story = { args: { active: "league" } };

/** Starts on Settings. */
export const ActiveSettings: Story = { args: { active: "settings" } };

/** On the home (#763): no item current, no highlight; the chests waiting on Chests. No header from `desktop` (`desktop="none"`). */
export const Home: Story = { args: { active: null, desktop: "none", badges: { chests: 2 } } };

/** On Missions or the Vault: from `desktop` the header marks them; the phone's bar has no item current. */
export const ActiveVault: Story = { args: { active: "vault" } };

/** The home's bar at 320, 375 and 768 px. */
export const HomePhone320: Story = { ...Home, ...PHONE_320 };
export const HomePhone375: Story = { ...Home, ...PHONE_375 };
export const HomeTablet768: Story = { ...Home, ...TABLET_768 };
/** The tab pages' header at 1440 px (unchanged, #762). */
export const HeaderWide: Story = { args: { active: "quests" }, ...WIDE_1440 };
