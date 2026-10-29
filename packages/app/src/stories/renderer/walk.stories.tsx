import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEFAULT_WALK_SETTINGS as WALK } from "@paved/renderer";
import { WALK_VILLAGES, WalkBoard } from "./walk-board";

/**
 * The first-person walk's prototype (V4-WALK-1, #876, PR 1 of 2), for the owner to try on a phone and on a desktop: a camera at
 * eye level in the village's streets, along the roads, the paths and inside the cities, that never goes through a voxel.
 *
 * - **Walk** (the Camera mode's button, #875, in PR 2) drops the walker on the road nearest the screen's centre, with an eased
 *   descent from the orbit view; **Exit** (or Escape) lifts it back to the view it came from. Under reduced motion both are cuts.
 * - **Desktop**: the movement keys by their place (ZQSD on an AZERTY keyboard, WASD on a QWERTY one, and the arrows); a click
 *   locks the mouse to the look, Escape frees it, a second Escape leaves.
 * - **Touch**: the move stick at the bottom left, the look stick at the bottom right (its speed grows with its tilt).
 * - The walker is a cylinder tested against every solid voxel of the tiles around it: it slides along walls, climbs a voxel at
 *   most, passes under what is higher than its head, and stops at the edge of the roads and the cities (open point 4).
 * - The knobs: the eye's height above the floor (open point 2: 5 voxels, about a third of a model's height), the speed, the field
 *   of view (70°) and the head bob.
 */
const meta = {
  title: "Renderer/Walk",
  component: WalkBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    village: { control: "inline-radio", options: Object.keys(WALK_VILLAGES), description: "The village: a starter one (9 tiles) or a large one (22)" },
    input: { control: "inline-radio", options: ["auto", "touch", "desktop"], description: "The sticks, or the keys and the mouse; auto: by the pointer" },
    autoWalk: { control: "boolean", description: "Start walking once the board is drawn" },
    eyeVoxels: { control: { type: "range", min: 2, max: 12, step: 0.5 }, description: `The eye above the floor, in voxels (default ${WALK.eyeVoxels})` },
    speed: { control: { type: "range", min: 4, max: 40, step: 1 }, description: `Voxels a second at full tilt (default ${WALK.speed})` },
    fov: { control: { type: "range", min: 50, max: 90, step: 1 }, description: `The field of view while walking, degrees (default ${WALK.fov})` },
    bobVoxels: { control: { type: "range", min: 0, max: 0.6, step: 0.05 }, description: `The head bob's height, voxels (default ${WALK.bobVoxels}; none under reduced motion)` },
  },
  args: {
    village: "starter",
    input: "auto",
    autoWalk: false,
    eyeVoxels: WALK.eyeVoxels,
    speed: WALK.speed,
    fov: WALK.fov,
    bobVoxels: WALK.bobVoxels,
  },
} satisfies Meta<typeof WalkBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The starter village in the orbit view, with Walk. */
export const Starter: Story = {};
/** The large village in the orbit view, with Walk. */
export const Large: Story = { args: { village: "large" } };
/** Walking in the starter village, the keys and the mouse (a click locks the mouse to the look). */
export const WalkingDesktop: Story = { args: { autoWalk: true, input: "desktop" } };
/** Walking in the large village, on the two sticks. */
export const WalkingTouch: Story = { args: { village: "large", autoWalk: true, input: "touch" } };
