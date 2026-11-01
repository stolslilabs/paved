import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MissionTile } from "./mission-tile";

/** A mission as an icon of the Missions page (#832): its icon, its Cobbles, its state; ringed when selected. One story per state. */
const meta = {
  title: "Containers/MissionTile",
  component: MissionTile,
  args: { title: "Public Works", icon: "castle", state: "progress", cobbles: 10, progress: 0.5, onSelect: fn() },
  decorators: [(Story) => <div className="w-20 p-2"><Story /></div>],
} satisfies Meta<typeof MissionTile>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Something counted: a thin bar under the icon. */
export const InProgress: Story = {};
/** Selected: ringed, the card at the top shows it. */
export const Selected: Story = { args: { selected: true } };
/** Done, its Cobbles waiting: a glow. */
export const Claimable: Story = { args: { title: "Daily Run", icon: "flag-checkered", state: "claimable", cobbles: 5 } };
/** Done and claimed: a check. */
export const Done: Story = { args: { title: "Daily Run", icon: "flag-checkered", state: "done", cobbles: 5 } };
/** A limited mission not started. */
export const ToDo: Story = { args: { state: "none" } };
/** A lifetime mission with nothing counted. */
export const Locked: Story = { args: { title: "Pilgrimage", icon: "landmark-dome", state: "locked", cobbles: 30 } };
/** A mission with no Cobbles (On the Podium in v1). */
export const NoCobbles: Story = { args: { title: "On the Podium", icon: "crown", state: "locked", cobbles: undefined } };
