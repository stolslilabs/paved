import type { Meta, StoryObj } from "@storybook/react-vite";
import after48Default60 from "./captures/after48-default60.webp";
import after48Pan60 from "./captures/after48-pan60.webp";
import after96Default60 from "./captures/after96-default60.webp";
import after96Pan60 from "./captures/after96-pan60.webp";
import afterDefault from "./captures/after-default.webp";
import afterPan from "./captures/after-pan.webp";
import afterTop from "./captures/after-top.webp";
import afterZoomedIn from "./captures/after-zoomed-in.webp";
import afterZoomedOut from "./captures/after-zoomed-out.webp";
import beforeDefault from "./captures/before-default.webp";
import beforeDefault60 from "./captures/before-default60.webp";
import beforePan from "./captures/before-pan.webp";
import beforePan60 from "./captures/before-pan60.webp";
import beforeTop from "./captures/before-top.webp";
import beforeZoomedIn from "./captures/before-zoomed-in.webp";
import beforeZoomedOut from "./captures/before-zoomed-out.webp";
import visBeforeDeskOut from "./captures/vis-before-desk-out.webp";
import visBeforeDeskDefault from "./captures/vis-before-desk-default.webp";
import visBeforeDeskIn from "./captures/vis-before-desk-in.webp";
import visBeforeM360Out from "./captures/vis-before-m360-out.webp";
import visBeforeM360Default from "./captures/vis-before-m360-default.webp";
import visBeforeM360In from "./captures/vis-before-m360-in.webp";
import visAfterDeskOut from "./captures/vis-after-desk-out.webp";
import visAfterDeskDefault from "./captures/vis-after-desk-default.webp";
import visAfterDeskIn from "./captures/vis-after-desk-in.webp";
import visAfterM360Out from "./captures/vis-after-m360-out.webp";
import visAfterM360Default from "./captures/vis-after-m360-default.webp";
import visAfterM360In from "./captures/vis-after-m360-in.webp";
import { VIEW_LABELS } from "./outlines-tour";

interface Capture {
  label: string;
  src: string;
}

interface Row {
  key: string;
  title: string;
  note: string;
  captures: Capture[];
  /** Pixel size the captures were taken and are shown at. */
  width: number;
  height: number;
}

/**
 * Headless Chrome on the Mac's GPU (ANGLE Metal), the "Renderer/Outlines" story at the same camera positions: "Before"
 * is main's renderer (1 px `LineSegments`), "After" is R-OUT's. The first two rows are at the game's opening view in a
 * 1440 x 900 window (a tile about 60 px), at the default threshold (48) and at the earlier one (96). The other rows
 * were taken at 800 x 500 CSS px at 1x, with the earlier threshold of 96 px.
 *
 * The captures are records of their PRs and keep the camera of their time: opening straight down, tilted at most 27
 * degrees, the closest zoom 5 (then 8). Since TILT-54 the game opens at 27 degrees and tilts to 54, the closest zoom 10;
 * the live "Renderer/Outlines" story holds those views ("Default view", "Fully zoomed out", "Fully zoomed in").
 */
const ROWS: Row[] = [
  {
    key: "default60",
    title: "Default view, a tile about 60 px",
    note: "The game's opening camera (distance 240) in a 1440 x 900 window, the centre 800 x 500 px at 1:1. The outlines take a steady 19 % of the scene's brightness at threshold 48 (main's: about 40 %), and the board is about 18 % darker than with none.",
    captures: [
      { label: "Before (main)", src: beforeDefault60 },
      { label: "After, threshold 48 (default)", src: after48Default60 },
      { label: "After, threshold 96", src: after96Default60 },
    ],
    width: 800,
    height: 500,
  },
  {
    key: "pan60",
    title: "Panning at the default view",
    note: "The board dragged 2 px at a time at distance 240 in a 1440 x 900 window (six frames, the centre 400 x 250 px at 1:1). At threshold 48 no outline appears or drops out across the pan.",
    captures: [
      { label: "Before (main)", src: beforePan60 },
      { label: "After, threshold 48 (default)", src: after48Pan60 },
      { label: "After, threshold 96", src: after96Pan60 },
    ],
    width: 400,
    height: 250,
  },
  {
    key: "top",
    title: VIEW_LABELS.top,
    note: "Straight down, distance 50: a tile is 161 px wide. Taken at threshold 96; at 48 the lines are fully opaque here.",
    captures: [
      { label: "Before (main)", src: beforeTop },
      { label: "After, threshold 96", src: afterTop },
    ],
    width: 800,
    height: 500,
  },
  {
    key: "pan",
    title: VIEW_LABELS.pan,
    note: "The board dragged 2 px at a time from the top view (an animation of six frames, the centre 400 x 250 px at 1:1). Taken at threshold 96; at 48 the lines are fully opaque here.",
    captures: [
      { label: "Before (main)", src: beforePan },
      { label: "After, threshold 96", src: afterPan },
    ],
    width: 400,
    height: 250,
  },
  {
    key: "default",
    title: `${VIEW_LABELS.default}, small window`,
    note: "The game's opening camera, straight down at 240, in an 800 x 500 window: a tile is 34 px wide, under either threshold.",
    captures: [
      { label: "Before (main)", src: beforeDefault },
      { label: "After", src: afterDefault },
    ],
    width: 800,
    height: 500,
  },
  {
    key: "zoomed-out",
    title: VIEW_LABELS["zoomed-out"],
    note: "Distance 300, the farthest, tilted.",
    captures: [
      { label: "Before (main)", src: beforeZoomedOut },
      { label: "After", src: afterZoomedOut },
    ],
    width: 800,
    height: 500,
  },
  {
    key: "zoomed-in",
    title: VIEW_LABELS["zoomed-in"],
    note: "Distance 5, the closest, tilted, on the tile nearest the board's centre.",
    captures: [
      { label: "Before (main)", src: beforeZoomedIn },
      { label: "After", src: afterZoomedIn },
    ],
    width: 800,
    height: 500,
  },
];

/** R-VIS: the same views before and after the shadow bias and the new outlines, desktop and 360 px wide. */
const VIS_ROWS: Row[] = [
  {
    key: "desk-default",
    title: "Desktop, the opening view (a tile about 60 px)",
    note: "1440 x 900 at DPR 2, distance 240 straight down; the centre 800 x 500 CSS px at 1:1. Before: diagonal shadow-acne bands in every lit face and 1 px black lines at 16 %. After: a flat tint per face, and dark grey hairlines, fully on (fully on at the opening tile size S, here 60 px, off at 0.85 S).",
    captures: [
      { label: "Before (main)", src: visBeforeDeskDefault },
      { label: "After (R-VIS)", src: visAfterDeskDefault },
    ],
    width: 800,
    height: 500,
  },
  {
    key: "desk-in",
    title: "Desktop, zoomed in (a tile 724 px)",
    note: "Distance 20 straight down. Before: the acne bands, with the dithered edges of three's PCF filter, and aliased black lines 2 px wide. After: flat faces, the trees' real cast shadows, antialiased dark grey hairlines.",
    captures: [
      { label: "Before (main)", src: visBeforeDeskIn },
      { label: "After (R-VIS)", src: visAfterDeskIn },
    ],
    width: 800,
    height: 500,
  },
  {
    key: "desk-out",
    title: "Desktop, zoomed out: the outlines vanish (a tile 48 px)",
    note: "Distance 300, tilted, the farthest: under 0.85 S (51 px), so no outlines either side; only the shading changes.",
    captures: [
      { label: "Before (main)", src: visBeforeDeskOut },
      { label: "After (R-VIS)", src: visAfterDeskOut },
    ],
    width: 800,
    height: 500,
  },
  {
    key: "m360-default",
    title: "360 px wide, the opening view (a tile about 52 px)",
    note: "360 x 780 at DPR 3, distance 240; the centre 360 x 450 CSS px at 1:1. A phone's shorter viewport opens at S = 52 px a tile: the outlines are fully on at the opening view (off at 0.85 S, 44 px).",
    captures: [
      { label: "Before (main)", src: visBeforeM360Default },
      { label: "After (R-VIS)", src: visAfterM360Default },
    ],
    width: 360,
    height: 450,
  },
  {
    key: "m360-in",
    title: "360 px wide, zoomed in (a tile 627 px)",
    note: "Distance 20 straight down.",
    captures: [
      { label: "Before (main)", src: visBeforeM360In },
      { label: "After (R-VIS)", src: visAfterM360In },
    ],
    width: 360,
    height: 450,
  },
  {
    key: "m360-out",
    title: "360 px wide, zoomed out: the outlines vanish (a tile 42 px)",
    note: "Distance 300, tilted: under 0.85 S (44 px), so no outlines either side.",
    captures: [
      { label: "Before (main)", src: visBeforeM360Out },
      { label: "After (R-VIS)", src: visAfterM360Out },
    ],
    width: 360,
    height: 450,
  },
];

function Figure({ capture, row }: { capture: Capture; row: Row }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="font-mono text-xs text-muted-foreground">{capture.label}</figcaption>
      <img src={capture.src} width={row.width} height={row.height} alt={`${capture.label}: ${row.title}`} className="h-auto max-w-full rounded-md border border-border" />
    </figure>
  );
}

/** Each camera position, before and after, side by side. */
function OutlinesComparison({ rows = ROWS }: { rows?: Row[] }) {
  return (
    <div className="flex flex-col gap-8 p-4 text-foreground sm:p-6">
      {rows.map((row) => (
        <section key={row.key} className="flex flex-col gap-2">
          <h2 className="text-lg">{row.title}</h2>
          <p className="text-sm text-muted-foreground">{row.note}</p>
          <div className="flex flex-wrap gap-4">
            {row.captures.map((capture) => (
              <Figure key={capture.label} capture={capture} row={row} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The before and after captures of R-OUT and R-VIS, at the camera positions of the live "Renderer/Outlines" story. */
const meta = {
  title: "Renderer/Outlines comparison",
  component: OutlinesComparison,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OutlinesComparison>;
export default meta;
type Story = StoryObj<typeof meta>;

/** R-OUT: the outlines that scale with zoom and do not flicker. */
export const BeforeAndAfter: Story = {};

/**
 * R-VIS (headless Chrome on the Mac's GPU, ANGLE Metal): the shading's acne removed by the shadow map's biases, and the
 * outlines as voxel-width, antialiased, dark grey strokes fully on at the tile size the board opens at (S) and off at 0.85 S.
 */
export const ShadingAndOutlines: Story = { args: { rows: VIS_ROWS } };
