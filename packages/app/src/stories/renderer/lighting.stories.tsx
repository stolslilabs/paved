import type { Meta, StoryObj } from "@storybook/react-vite";
import { LOOK_PRESET_NAMES, QUALITY_TIERS } from "@paved/renderer";
// The owner's target images, read where they are kept (not copied): Vite serves the workspace.
import mockup01 from "../../../../../app/docs/mockup-01.png";
import mockup02 from "../../../../../app/docs/mockup-02.png";
import { LightingBoard } from "./lighting-board";
import { lookArgTypes } from "./lighting-look";
import { MAX_DISTANCE, MIN_DISTANCE, VIEWS } from "./outlines-tour";

/**
 * The board's lighting and post-processing (LIGHT) on the recorded 72-tile board: a warm key light with soft shadows, a
 * cool fill and sky light, ambient occlusion in the crevices, a filmic tone map (AgX or ACES) with a light grade, the
 * vignette and fog into the background, gold slot outlines and ghost with a subtle bloom, and brighter, glossier water.
 * Pick a preset, then set any field over it; the quality tier turns off what a device cannot afford (the readout lists
 * the passes that run). Unset fields keep the preset's value.
 */
const meta = {
  title: "Renderer/Lighting",
  component: LightingBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    preset: { control: "inline-radio", options: LOOK_PRESET_NAMES, description: "The look every field starts from" },
    quality: {
      control: "inline-radio",
      options: ["auto", ...QUALITY_TIERS],
      // An enum, so a URL can set it (`args=quality:high`): Storybook drops a URL arg its docgen type (an unresolved
      // union here) does not validate.
      type: { name: "enum", value: ["auto", ...QUALITY_TIERS] },
      description: "Graphics quality: low runs no extra pass, medium adds the bloom, high the ambient occlusion. auto: low on a coarse pointer or a small screen, medium elsewhere; high only by hand (provisional until measured on the GPU)",
    },
    view: { control: "select", options: VIEWS, description: "The camera's view (default: the game's opening view)" },
    distance: { control: { type: "range", min: MIN_DISTANCE, max: MAX_DISTANCE, step: 1 }, description: "Camera distance; unset, the view's own" },
    highlights: { control: "boolean", description: "Show the empty slots and the ghost of the tile in hand" },
    redraw: { control: "boolean", description: "Draw every frame even when nothing moves (frame-time measures)" },
    readout: { control: "boolean", description: "Show the tier in effect and the passes that run" },
    forest: { control: "boolean", description: "Forest on all 19 plans: every tile draws its cell's variant (SKIN-RENDER)" },
    force: {
      control: "inline-radio",
      options: ["auto", "on", "off"],
      description: "Outlines: auto turns them off on software WebGL; on and off force them (the GPU measures force them on)",
    },
    maxPixelRatio: {
      // Keys without a dot, so a URL can name one (`args=maxPixelRatio:x1_5`); `mapping` gives the renderer the number.
      control: { type: "select", labels: { auto: "auto", x1: "1", x1_5: "1.5", x2: "2" } },
      options: ["auto", "x1", "x1_5", "x2"],
      mapping: { auto: "auto", x1: 1, x1_5: 1.5, x2: 2 },
      description: "The pixel-ratio cap: auto is the device's (1.5 on a desktop, 2 on a coarse pointer or a small screen)",
    },
    ...lookArgTypes(),
  },
  args: { preset: "mockup", quality: "auto", view: "default", highlights: true, redraw: false, readout: true, forest: false, force: "auto", maxPixelRatio: "auto" },
} satisfies Meta<typeof LightingBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Toward the mockups: the default look. */
export const Mockup: Story = {};

/** A gentler look: higher sun, softer contrast, AgX. */
export const Soft: Story = { args: { preset: "soft" } };

/** Plain lights and no effect: only the scene and the final pass (tone map, sRGB) run. */
export const Off: Story = { args: { preset: "off" } };

/** Zoomed in at the play camera's steepest tilt, where the shadows, the AO and the water show most. */
export const ZoomedIn: Story = { args: { view: "zoomed-in", distance: 30 } };

const MOCKUPS = { "mockup-01": mockup01, "mockup-02": mockup02 } as const;

interface SideBySideProps extends React.ComponentProps<typeof LightingBoard> {
  mockup: keyof typeof MOCKUPS;
}

function SideBySide({ mockup, ...board }: SideBySideProps) {
  return (
    <div className="grid h-dvh w-full grid-cols-1 bg-board md:grid-cols-2">
      <div className="relative min-h-[50dvh]">
        <LightingBoard {...board} />
      </div>
      <figure className="flex min-h-0 flex-col items-center justify-center gap-2 overflow-auto p-4">
        <img src={MOCKUPS[mockup]} alt={`The target look, ${mockup}`} className="max-h-full max-w-full object-contain" />
        <figcaption className="text-xs text-muted-foreground">{mockup}.png (the target)</figcaption>
      </figure>
    </div>
  );
}

/** The board at the opening view beside a mockup, with every control: compare, then pick. */
export const SideBySideWithMockup: StoryObj<SideBySideProps> = {
  name: "Side by side with the mockup",
  render: (args) => <SideBySide {...args} />,
  argTypes: { mockup: { control: "inline-radio", options: Object.keys(MOCKUPS), description: "The mockup shown beside the board" } },
  args: { mockup: "mockup-01" },
};
