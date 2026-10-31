import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_PAGE } from "../../mocks/guilds";
import { GuildConfirmDialog, GuildFormSheet, NEW_GUILD } from "./guild-sheets";

const quarry = GUILD_PAGE.leader.guild;

/** Creating a guild, or the leader's settings (#953): a bottom sheet on a phone, a panel from the right from `desktop`. */
const meta = {
  title: "Containers/GuildSheets",
  component: GuildFormSheet,
  args: { open: true, onOpenChange: fn(), mode: "create", initial: NEW_GUILD, onSubmit: fn() },
} satisfies Meta<typeof GuildFormSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
/** A name too short: why, and Create disabled. */
export const CreateInvalid: Story = { args: { initial: { ...NEW_GUILD, name: "Wy" } } };
/** The source refused it: the name is taken. */
export const CreateRefused: Story = { args: { initial: { ...NEW_GUILD, name: "The Quarrymen" }, error: "Another guild has this name." } };
export const Settings: Story = { args: { mode: "edit", initial: { name: quarry.name, emblem: quarry.emblem, description: quarry.description, joinType: quarry.joinType, requirements: quarry.requirements } } };
export const Saving: Story = { args: { mode: "edit", initial: { ...NEW_GUILD, name: quarry.name }, pending: true } };
/** With reduced motion: the sheet opens without its slide. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" } };
/** A kick's confirmation, with its optional reason. */
export const ConfirmKick: Story = {
  render: () => (
    <GuildConfirmDialog
      confirmation={{ title: "Kick millstone_mara?", text: "They leave The Quarrymen at once.", confirm: "Kick", destructive: true, field: { label: "Reason", max: 100, optional: true } }}
      onCancel={fn()}
      onConfirm={fn()}
    />
  ),
};
/** A refused confirmation keeps the dialog, with why. */
export const ConfirmRefused: Story = {
  render: () => <GuildConfirmDialog confirmation={{ title: "Leave The Quarrymen?", text: "You can join another guild.", confirm: "Leave", destructive: true }} onCancel={fn()} onConfirm={fn()} error="Make another member leader first." />,
};
