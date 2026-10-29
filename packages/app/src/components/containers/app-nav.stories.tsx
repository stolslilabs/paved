import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import type { Tab } from "../../routes/pages";
import { CentreGuide, expectIconCentred } from "../../stories/centre-guide";
import { PHONE_320, PHONE_375, TABLET_768 } from "../scenes/viewports";
import { AppNav } from "./app-nav";

/**
 * Every story keeps its own active tab: a click moves it, so the white states and the gold of the current item can be checked.
 * `active` is the starting tab. A click on the current item returns to the village, as in the app (TAB-RETAP, #800): no item current.
 */
function Stateful({ active, onNavigate, ...args }: React.ComponentProps<typeof AppNav>) {
  const [current, setCurrent] = useState<Tab | null>(active);
  useEffect(() => setCurrent(active), [active]);
  return (
    <AppNav
      {...args}
      active={current}
      onNavigate={(tab) => {
        setCurrent(tab === current ? null : tab);
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
  decorators: [(Story) => <div className="flex min-h-[20rem] flex-col justify-end"><Story /></div>],
} satisfies Meta<typeof AppNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Direction D (#537): the bottom bar, below 1024 px (the theme's `desktop`) only: from it the navigation is the home's overlay
 * and its side panels (DESK-PANELS, #762), so the bar draws nothing there. The current item is gold on the white 15% layer; hover is 10%, a press 20%. TAB-SWIPE (#726): on a phone the items are icons and only the current one shows its
 * label; a click here slides the highlight to the new item, folds the old label and unfolds the new one (the bar stays
 * mounted: plain transitions; in the app each page mounts its own bar, which starts from the last one's state). None under
 * reduced motion. PHONE-NAV (#763): the bar holds Shop, Chests, Play, League, Settings; Play, in the centre, has no label: a
 * gold disc raised above the bar, and no highlight. One story per item of the bar active.
 */
export const Default: Story = {};

/** Starts on Chests, with 3 chests waiting (its badge). */
export const ActiveChests: Story = { args: { active: "chests", badges: { chests: 3 } } };

/** Chests active on a phone: its treasure chest (issue 873), a game icon, with its label and its badge. */
export const ActiveChestsPhone375: Story = { ...ActiveChests, ...PHONE_375 };
export const ActiveChestsPhone320: Story = { ...ActiveChests, ...PHONE_320 };

/** Play active: it never is in the app (the mode choice is a full-screen page, without the bar), shown for the states. */
export const ActivePlay: Story = { args: { active: "play" } };

/** Starts on League (the league page and its defence log). */
export const ActiveLeague: Story = { args: { active: "league" } };

/** Starts on Settings. */
export const ActiveSettings: Story = { args: { active: "settings" } };

/** On the home (#763): no item current, no highlight; the chests waiting on Chests. */
export const Home: Story = { args: { active: null, badges: { chests: 2 } } };

/** On Missions or the Vault: the bar has no item current. */
export const ActiveVault: Story = { args: { active: "vault" } };

/**
 * TAB-RETAP (#800, the owner's decision of 2026-10-26): the current item, League here, says "Tap again to return to the
 * village"; tapped again, it closes its page and the bar is the home's, no item current (in the app: the village, with no swipe).
 */
export const Retap: Story = {
  args: { active: "league" },
  play: async ({ canvasElement, args }) => {
    const league = within(canvasElement).getByRole("button", { name: "League", current: "page" });
    await expect(league).toHaveAccessibleDescription("Tap again to return to the village");
    await userEvent.click(league);
    await expect(args.onNavigate).toHaveBeenCalledWith("league");
    await expect(within(canvasElement).queryByRole("button", { current: "page" })).toBeNull();
  },
};

/** The retap at 320 and 375 px. */
export const RetapPhone320: Story = { ...Retap, ...PHONE_320 };
export const RetapPhone375: Story = { ...Retap, ...PHONE_375 };

/** The home's bar at 320, 375 and 768 px. */
export const HomePhone320: Story = { ...Home, ...PHONE_320 };
export const HomePhone375: Story = { ...Home, ...PHONE_375 };
export const HomeTablet768: Story = { ...Home, ...TABLET_768 };

/**
 * SWORDS-CENTRE (#827, the owner's decision of 2026-10-27): the swords sit at the centre of the Play disc, under a centre guide
 * (two red lines through the disc's centre). The play checks the icon's centre is the disc's to half a pixel.
 */
export const PlayCentredPhone375: Story = {
  ...PHONE_375,
  args: { active: null },
  decorators: [(Story) => <CentreGuide label="Play"><Story /></CentreGuide>],
  play: ({ canvasElement }) => expectIconCentred(canvasElement, "Play"),
};

/** The same at 320 px. Both pinned to a phone: from `desktop` the bar draws nothing, and the home's Play is `Scenes/Home`'s. */
export const PlayCentredPhone320: Story = { ...PlayCentredPhone375, ...PHONE_320 };
