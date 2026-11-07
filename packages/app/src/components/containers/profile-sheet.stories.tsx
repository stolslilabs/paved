import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PROGRESS } from "../../mocks/players";
import { SAVED_LOOK } from "../../mocks/avatar";
import { NEW_PLAYER, NEW_PLAYER_PROFILE } from "../../mocks/new-player";
import { HALL_OF_FAME, PROFILE, RECORDS } from "../../mocks/scenes";
import { GUILD_BADGE } from "../../mocks/guilds";
import { RENAME } from "../../mocks/rename";
import { GuildLine } from "./guild-profile";
import { ProfileSheet } from "./profile-sheet";
import { RenameView } from "./rename-view";

/**
 * What a tap on the player card opens (#624, PROFILE-DRAWER; PROFILE-PAGE, 2026-11-04): the HUD's drawer, a full page with Back on a
 * phone, a side panel docked at the left from `tablet` (the Viewport control). The Hall of Fame and the Stats have no source yet: the
 * stories give them (`HALL_OF_FAME`, `RECORDS`).
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
    // The player's guild line, before the actions (FRIENDS-PAGE, the owner's ask of 2026-11-05).
    guild: <GuildLine badge={GUILD_BADGE.member} onOpen={fn()} />,
    hallOfFame: HALL_OF_FAME,
    records: RECORDS,
    onOpenChange: fn(),
    onCopy: fn(async () => {}),
    onEditAvatar: fn(),
    // PLAYER-RENAME: the pencil's view, as the app reads it (`ReadRenameView`), here the first change's.
    renameView: (onBack) => <RenameView {...RENAME.free} onBack={onBack} onRename={fn()} />,
    onOpenLeague: fn(),
    onOpenTiles: fn(),
    onOpenInvite: fn(),
  },
} satisfies Meta<typeof ProfileSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The mockups': the avatar in its league's rim and crest (Bronze II, #917), the name and its pencil, the address (a tap copies it);
 * the level (#625) and its bar (the XP left and in all, #830, for screen readers), the crowns and the league, the figures
 * with the follow counts (#954), the four actions, the Hall of Fame (season 6 picked) and its Stats.
 */
export const Connected: Story = {};
/** PLAYER-RENAME: the pencil opens the name's view in the drawer, Back returns to the profile. */
export const EditName: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("button", { name: "Edit name" }));
    await expect(await page.findByRole("textbox", { name: "New name" })).toBeInTheDocument();
    await userEvent.click(page.getAllByRole("button", { name: "Back" })[0]!);
    await expect(await page.findByRole("button", { name: "Edit name" })).toBeInTheDocument();
  },
};
/** PLAYER-RENAME: opened on the name's view, a later change (50 Cobbles). */
export const Renaming: Story = { args: { defaultRenaming: true, renameView: (onBack) => <RenameView {...RENAME.paid} onBack={onBack} onRename={fn()} /> } };
/** A tap on the picked season lets go of it: the Stats show all time, the badge says so and has no cross. */
export const AllTime: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("button", { name: /^Season 6:/ }));
    await expect(page.getByText("All time")).toBeInTheDocument();
    await expect(page.queryByRole("button", { name: "Show all time" })).toBeNull();
  },
};
/** An earlier season picked from the Hall of Fame: its Stats, its badge with the cross back to all time. */
export const EarlierSeason: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole("button", { name: /^Season 4:/ }));
    await expect(page.getByText("Season 4")).toBeInTheDocument();
  },
};
/** Neither given and no app sources to read them from (the app reads the mock's, `playerRecords`): no Hall of Fame, no Stats. */
export const NoHistory: Story = { args: { hallOfFame: undefined, records: undefined } };
/** No league known (not read, no PvP on the network): a plain ring, no league's name. */
export const NoLeague: Story = { args: { league: null } };
/** Only Avatar offered: the other actions' callbacks left out. */
export const OneAction: Story = { args: { onOpenLeague: undefined, onOpenTiles: undefined, onOpenInvite: undefined } };
/** Before any crown and any attack: Unranked's crest. */
export const LeagueUnranked: Story = { args: { league: { crowns: 0, league: 0, unranked: true } } };
/**
 * The first season played Unranked (`SeasonStanding.unranked`, no attack that season), the others the Hall of Fame's: its card's banner
 * is Unranked's empty slot, grey with a dashed edge (UNRANKED-PLACEHOLDER).
 */
export const HallOfFameUnranked: Story = {
  args: { hallOfFame: [{ season: 1, league: 0, crowns: 0, unranked: true }, ...HALL_OF_FAME.slice(1)] },
};
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
export const Loading: Story = { args: { state: PROFILE.loading } };
/** WRAP360: the longest name, the largest figures. */
export const Stress: Story = { args: { state: PROFILE.stress, progress: { ...PROGRESS.stress, total: 123_456_789 }, follows: { followers: 1_234_567, followed: 500 } } };
