import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PROGRESS } from "../../mocks/players";
import { SAVED_LOOK } from "../../mocks/avatar";
import { NEW_PLAYER, NEW_PLAYER_PROFILE } from "../../mocks/new-player";
import { PROFILE } from "../../mocks/scenes";
import { ProfileSheet } from "./profile-sheet";

/**
 * What a tap on the player card opens (#624, PROFILE-DRAWER): the HUD's drawer, from the bottom on a phone up to the HUD's end (`top`,
 * here 250 px as on the home), a side panel docked at the left from `tablet` (the Viewport control).
 */
const meta = {
  title: "Containers/ProfileSheet",
  component: ProfileSheet,
  args: {
    open: true,
    state: PROFILE.connected,
    progress: PROGRESS.partWay,
    league: { crowns: 1_172, league: 5, unranked: false },
    follows: { followers: 12, followed: 9 },
    top: 250,
    onOpenChange: fn(),
    onConnect: fn(),
    onDisconnect: fn(),
    onCopy: fn(async () => {}),
    onEditAvatar: fn(),
    onOpenLeague: fn(),
    onOpenCollection: fn(),
    onOpenInvite: fn(),
  },
} satisfies Meta<typeof ProfileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The mockup's: the avatar in its league's rim and crest (Bronze II, #917), the name and the league's, the address with Copy, the
 * level (#625) and its bar (the XP left and in all, #830, for screen readers), the figures with the follow counts (#954), the four actions, Disconnect.
 */
export const Connected: Story = {};
/** No league known (not read, no PvP on the network): a plain ring, no league's name. */
export const NoLeague: Story = { args: { league: null } };
/** With no HUD measured (another opener): the drawer's top stops under a page's header. */
export const NoHud: Story = { args: { top: undefined } };
/** Only Avatar offered: the other actions' callbacks left out. */
export const OneAction: Story = { args: { onOpenLeague: undefined, onOpenCollection: undefined, onOpenInvite: undefined } };
/** Before any crown and any attack: Unranked's crest. */
export const LeagueUnranked: Story = { args: { league: { crowns: 0, league: 0, unranked: true } } };
/** The top league beside the longest name. */
export const LeagueGrandMaster: Story = { args: { league: { crowns: 5_320, league: 22, unranked: false }, state: PROFILE.stress } };
/** The avatar the player saved (#626), its still in the ring. */
export const SavedAvatar: Story = { args: { look: SAVED_LOOK } };
/** The first level: none made, 100 to level 2, none in all. */
export const FirstLevel: Story = { args: { progress: PROGRESS.start } };
/** A source that does not know the whole XP: the XP made and left only. */
export const NoTotal: Story = { args: { progress: PROGRESS.nearlyFull } };
/** The level cap (20, #734): "Max level" in place of the XP left. */
export const MaxLevel: Story = { args: { progress: PROGRESS.maxLevel } };
/** The level and XP still read: the empty bar and dashes. */
export const ProgressLoading: Story = { args: { progress: undefined } };
export const NoUsername: Story = { args: { state: PROFILE.noUsername } };
/** A new player on the mock (#926): the name and the look of free items drawn at their first connection, level 1, no games yet. */
export const NewPlayer: Story = { args: { state: NEW_PLAYER_PROFILE, look: NEW_PLAYER.look, progress: PROGRESS.start } };
/** The follow counts not read yet: Games alone. */
export const NoFollows: Story = { args: { follows: undefined } };
/** A guest: the Training line and Connect. */
export const Guest: Story = { args: { state: PROFILE.guest } };
export const Connecting: Story = { args: { state: PROFILE.connecting } };
export const Loading: Story = { args: { state: PROFILE.loading } };
/** WRAP360: the longest name, the largest figures. */
export const Stress: Story = { args: { state: PROFILE.stress, progress: { ...PROGRESS.stress, total: 123_456_789 }, follows: { followers: 1_234_567, followed: 500 } } };
