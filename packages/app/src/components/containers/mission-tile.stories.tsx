import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MissionTile } from "./mission-tile";

/** A mission as an icon of the Missions page (#832): its icon and its state, no Cobbles under it (#988:
 * the card at the top shows them); ringed when selected. One story per state. */
const meta = {
  title: "Containers/MissionTile",
  component: MissionTile,
  args: { title: "Public Works", icon: "castle", state: "progress", progress: 0.5, onSelect: fn() },
  decorators: [(Story) => <div className="w-20 p-2"><Story /></div>],
} satisfies Meta<typeof MissionTile>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Something counted: a thin bar under the icon. */
export const InProgress: Story = {};
/** Selected: ringed, the card at the top shows it. */
export const Selected: Story = { args: { selected: true } };
/** Done, its Cobbles waiting: a glow (its Cobbles on the card at the top, not under the tile). */
export const Claimable: Story = { args: { title: "Daily Run", icon: "flag-checkered", state: "claimable" } };
/** Done and claimed: a check. */
export const Done: Story = { args: { title: "Daily Run", icon: "flag-checkered", state: "done" } };
/** A limited mission not started. */
export const ToDo: Story = { args: { state: "none" } };
/** A lifetime mission with nothing counted. */
export const Locked: Story = { args: { title: "Pilgrimage", icon: "landmark-dome", state: "locked" } };
