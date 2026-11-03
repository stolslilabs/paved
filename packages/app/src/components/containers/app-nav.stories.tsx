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
 * The dock (HOME-DOCK, the owner's asks of 2026-11-03, the mockup's footer): the painted ribbon with its wooden posts, Shop, Chests,
 * Play, Guild, Settings, each the mockup's icon over its label, Play the gold medallion rising above it (the swords over PLAY), no
 * highlight. Full width on a phone, centred from `tablet`. The current item: its label gold, the wood's shade under it, which slides
 * to a new item on a click (TAB-SWIPE, #726: the bar stays mounted here, plain transitions; in the app each page mounts its own bar,
 * which starts from the last one's state). None under reduced motion. One story per item active.
 */
export const Default: Story = {};

/** Starts on Chests, with 3 chests waiting (its badge). */
export const ActiveChests: Story = { args: { active: "chests", badges: { chests: 3 } } };

/** Chests active on a phone: the mockup's chest, its label and its badge. */
export const ActiveChestsPhone375: Story = { ...ActiveChests, ...PHONE_375 };
export const ActiveChestsPhone320: Story = { ...ActiveChests, ...PHONE_320 };

/** Play active: it never is in the app (the mode choice is a full-screen page, without the bar), shown for the states. */
export const ActivePlay: Story = { args: { active: "play" } };

/** Starts on Guild (HOME-DOCK: Guild in League's place, League reached by the crowns' capsule). */
export const ActiveGuild: Story = { args: { active: "guild" } };

/** Starts on Settings. */
export const ActiveSettings: Story = { args: { active: "settings" } };

/** On the home (#763): no item current, no highlight; the chests waiting on Chests, the guild's count on Guild. */
export const Home: Story = { args: { active: null, badges: { chests: 2, guild: 1 } } };

/** On Missions or the Vault: the bar has no item current. */
export const ActiveVault: Story = { args: { active: "vault" } };

/**
 * TAB-RETAP (#800, the owner's decision of 2026-10-26): the current item, Guild here, says "Tap again to return to the
 * village"; tapped again, it closes its page and the bar is the home's, no item current (in the app: the village, with no swipe).
 */
export const Retap: Story = {
  args: { active: "guild" },
  play: async ({ canvasElement, args }) => {
    const guild = within(canvasElement).getByRole("button", { name: "Guild", current: "page" });
    await expect(guild).toHaveAccessibleDescription("Tap again to return to the village");
    await userEvent.click(guild);
    await expect(args.onNavigate).toHaveBeenCalledWith("guild");
    await expect(within(canvasElement).queryByRole("button", { current: "page" })).toBeNull();
  },
};

/** The retap at 320 and 375 px. */
export const RetapPhone320: Story = { ...Retap, ...PHONE_320 };
export const RetapPhone375: Story = { ...Retap, ...PHONE_375 };

/** The home's dock at 320, 375 and 768 px, and from `desktop`. */
export const HomePhone320: Story = { ...Home, ...PHONE_320 };
export const HomePhone375: Story = { ...Home, ...PHONE_375 };
export const HomeTablet768: Story = { ...Home, ...TABLET_768 };

/**
 * SWORDS-CENTRE (#827, the owner's decision of 2026-10-27): the swords over PLAY sit at the centre of the medallion as one group
 * (HOME-DOCK), under a centre guide (two red lines through its centre). The play checks the group's centre is the medallion's to
 * half a pixel.
 */
export const PlayCentredPhone375: Story = {
  ...PHONE_375,
  args: { active: null },
  decorators: [(Story) => <CentreGuide label="Play"><Story /></CentreGuide>],
  play: ({ canvasElement }) => expectIconCentred(canvasElement, "Play"),
};

/** The same at 320 px. */
export const PlayCentredPhone320: Story = { ...PlayCentredPhone375, ...PHONE_320 };
