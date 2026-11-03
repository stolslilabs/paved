import type { Meta, StoryObj } from "@storybook/react-vite";
import { HudFrame } from "./hud-frame";

/** The shapes the HUD's frame takes: a capsule, the player card, a long bar, a tall box, the drawer. */
const SHAPES = [
  { name: "Capsule", px: 10, w: 140, h: 40 },
  { name: "Player card", px: 13, w: 230, h: 64 },
  { name: "Long bar", px: 10, w: 420, h: 40 },
  { name: "Tall box", px: 13, w: 120, h: 220 },
  { name: "Drawer", px: 16, w: 360, h: 260 },
] as const;

/**
 * The HUD's frame (HUD-FRAME-CSS): CSS at every shape, its rim and its painted patches at one scale whatever the box (the painted
 * 9-slice it replaced stretched its brush strokes with each box's shape).
 */
const meta = {
  title: "Elements/HudFrame",
  component: HudFrame,
  args: { px: 13 },
  render: () => (
    <div className="flex flex-wrap items-start gap-6 bg-board p-8">
      {SHAPES.map(({ name, px, w, h }) => (
        <div key={name} className="relative isolate grid place-items-center text-sm font-bold" style={{ width: w, height: h }}>
          <HudFrame px={px} />
          {name}
        </div>
      ))}
    </div>
  ),
} satisfies Meta<typeof HudFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One frame per shape the HUD gives it. */
export const Shapes: Story = {};
