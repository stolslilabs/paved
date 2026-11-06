import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { CentreGuide, expectIconCentred } from "../../stories/centre-guide";
import { PHONE_320, PHONE_375, TABLET_768 } from "../scenes/viewports";
import { AppNav } from "./app-nav";

const meta = {
  title: "Containers/AppNav",
  component: AppNav,
  args: { onNavigate: fn() },
  decorators: [(Story) => <div className="flex min-h-[20rem] flex-col justify-end"><Story /></div>],
} satisfies Meta<typeof AppNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The dock (HOME-DOCK, the owner's asks of 2026-11-03, the mockup's footer): the painted ribbon with its wooden posts, Shop, Ranking,
 * Play, Guild, Settings, each the mockup's icon over its label, Play the gold medallion rising above it (the swords over PLAY). Full
 * width on a phone, centred from `tablet`. Only the home draws it, under the pages it opens (DOCK-UNDER-PAGES): no item is ever the
 * current page.
 */
export const Default: Story = {};

/** 3 waiting on Guild: its badge. */
export const GuildWaiting: Story = { args: { badges: { guild: 3 } } };
export const GuildWaitingPhone375: Story = { ...GuildWaiting, ...PHONE_375 };
export const GuildWaitingPhone320: Story = { ...GuildWaiting, ...PHONE_320 };

/** On the home (#763): the guild's count on Guild; Ranking leads nowhere yet. */
export const Home: Story = { args: { badges: { guild: 1 } } };

/** A tap on an item asks for its page (the home's `useTabNavigate`). */
export const Pick: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Guild" }));
    await expect(args.onNavigate).toHaveBeenCalledWith("guild");
    await expect(within(canvasElement).queryByRole("button", { current: "page" })).toBeNull();
  },
};

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
  decorators: [(Story) => <CentreGuide label="Play"><Story /></CentreGuide>],
  play: ({ canvasElement }) => expectIconCentred(canvasElement, "Play"),
};

/** The same at 320 px. */
export const PlayCentredPhone320: Story = { ...PlayCentredPhone375, ...PHONE_320 };
