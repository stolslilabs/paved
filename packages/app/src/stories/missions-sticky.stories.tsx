import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MISSIONS } from "../mocks/scenes";
import { withCobbles } from "./with-cobbles";
import { MissionsScene } from "../components/scenes/missions-scene";
import { PHONE_320, PHONE_375, PHONE_SIDEWAYS, WIDE_1440 } from "../components/scenes/viewports";
import { scrolledToEnd } from "./scrolled-to-end";

/**
 * The Missions page's sticky card (#988), each story scrolled to the Achievements (`scrolledToEnd`) at a pinned viewport, so the
 * scroll is seen: from a viewport 560 px tall the card stays under the drawer's header (MISSIONS-PAGE), the medallions pass under
 * its bottom edge's fade, and a tap on a medallion shows that mission on it without a scroll; below 560 px (a phone held sideways)
 * it scrolls away with the page. No medallion shows Cobbles: Settler III's show on the card. The page's states, at the toolbar's viewport, are `Scenes/Missions`.
 */
const meta = {
  title: "Scenes/Missions Sticky",
  component: MissionsScene,
  decorators: [withCobbles],
  args: {
    ...MISSIONS.lifetime,
    onClaimQuest: fn(),
    onClaimMilestone: fn(),
    onClaimWeeklyMilestone: fn(),
    onClaimAchievement: fn(),
    onRetry: fn(),
    onBack: fn(),
  },
  play: scrolledToEnd,
} satisfies Meta<typeof MissionsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 320 x 568, the narrowest phone kept: the card under the header, three rows and a half of tiles under it. */
export const Phone320: Story = { ...PHONE_320 };

/** 375 x 812, the owner's first width. */
export const Phone375: Story = { ...PHONE_375 };

/** A phone held sideways, 667 x 375: under 560 px tall the card scrolls away with the page. */
export const Sideways: Story = { ...PHONE_SIDEWAYS };

/** 1440 x 900, the drawer's side panel at the right (MISSIONS-PAGE): the card sticks under the panel's header. */
export const Wide: Story = { ...WIDE_1440 };

/** Settler II's Cobbles to claim from the sticky card, at 375 px: its tile lit, its 20 Cobbles on the card alone. */
export const Claim375: Story = { ...PHONE_375, args: MISSIONS.claim };
