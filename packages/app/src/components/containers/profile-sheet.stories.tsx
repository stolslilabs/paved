import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PROGRESS } from "../../mocks/players";
import { SAVED_LOOK } from "../../mocks/avatar";
import { NEW_PLAYER, NEW_PLAYER_PROFILE } from "../../mocks/new-player";
import { PROFILE } from "../../mocks/scenes";
import { ProfileSheet } from "./profile-sheet";

/** What a tap on the avatar opens (#624): a bottom sheet on a phone, a panel from the left from `desktop` (the Viewport control). */
const meta = {
  title: "Containers/ProfileSheet",
  component: ProfileSheet,
  args: { open: true, state: PROFILE.connected, progress: PROGRESS.start, onOpenChange: fn(), onConnect: fn(), onDisconnect: fn(), onCopy: fn(async () => {}), onEditAvatar: fn() },
} satisfies Meta<typeof ProfileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The avatar larger in its XP ring, the name, the address with Copy, the level (#625) with the XP made, the XP left to the next and the whole XP (#830), the figures, Edit avatar (#626), Disconnect. */
export const Connected: Story = {};
/** The avatar the player saved (#626), its still in the ring. */
export const SavedAvatar: Story = { args: { look: SAVED_LOOK } };
/** The ring part way: 120 XP made, 180 to level 4, 420 in all. */
export const PartWay: Story = { args: { progress: PROGRESS.partWay } };
/** A source that does not know the whole XP: the XP made and left only. */
export const NoTotal: Story = { args: { progress: PROGRESS.nearlyFull } };
/** The level cap (20, #734): "Max level" in place of the XP left. */
export const MaxLevel: Story = { args: { progress: PROGRESS.maxLevel } };
/** The level and XP still read: the empty track and dashes. */
export const ProgressLoading: Story = { args: { progress: undefined } };
export const NoUsername: Story = { args: { state: PROFILE.noUsername } };
/** A new player on the mock (#926): the name and the look of free items drawn at their first connection, level 1, no games yet. */
export const NewPlayer: Story = { args: { state: NEW_PLAYER_PROFILE, look: NEW_PLAYER.look, progress: PROGRESS.start } };
/** A guest: the Training line and Connect. */
export const Guest: Story = { args: { state: PROFILE.guest } };
export const Connecting: Story = { args: { state: PROFILE.connecting } };
export const Loading: Story = { args: { state: PROFILE.loading } };
/** WRAP360: the longest name, the largest figures. */
export const Stress: Story = { args: { state: PROFILE.stress, progress: { ...PROGRESS.stress, total: 123_456_789 } } };
