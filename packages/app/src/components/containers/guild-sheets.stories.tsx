import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUILD_PAGE } from "../../mocks/guilds";
import { GuildConfirmDialog, GuildForm, NEW_GUILD } from "./guild-sheets";

const quarry = GUILD_PAGE.leader.guild;

/**
 * Creating a guild, or the leader's settings (#953; GUILD-PAGE: a view in the guild's drawer, in its style): the emblem as it will look,
 * the twenty-four charges and eighteen colours six to a row, the description, who can join, the requirements. Drawn on the drawer's face.
 */
const meta = {
  title: "Containers/GuildSheets",
  component: GuildForm,
  args: { mode: "create", initial: NEW_GUILD, onSubmit: fn() },
  decorators: [(Story) => <div className="max-w-md bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof GuildForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
/** A name too short: why, and Create disabled. */
export const CreateInvalid: Story = { args: { initial: { ...NEW_GUILD, name: "Wy" } } };
/** The source refused it: the name is taken. */
export const CreateRefused: Story = { args: { initial: { ...NEW_GUILD, name: "The Quarrymen" }, error: "Another guild has this name." } };
export const Settings: Story = { args: { mode: "edit", initial: { name: quarry.name, emblem: quarry.emblem, description: quarry.description, joinType: quarry.joinType, requirements: quarry.requirements } } };
/** A charge in a colour of its own (GUILD-PAGE): the third row. */
export const SettingsChargeColour: Story = { args: { mode: "edit", initial: { name: quarry.name, emblem: { ...quarry.emblem, charge: 12 }, description: quarry.description, joinType: "invite", requirements: { level: 12, crowns: 900 } } } };
export const Saving: Story = { args: { mode: "edit", initial: { ...NEW_GUILD, name: quarry.name }, pending: true } };
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
