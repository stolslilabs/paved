import type { Meta, StoryObj } from "@storybook/react-vite";
import afterDefault from "./captures/after-default.webp";
import afterPan from "./captures/after-pan.webp";
import afterTop from "./captures/after-top.webp";
import afterZoomedIn from "./captures/after-zoomed-in.webp";
import afterZoomedOut from "./captures/after-zoomed-out.webp";
import beforeDefault from "./captures/before-default.webp";
import beforePan from "./captures/before-pan.webp";
import beforeTop from "./captures/before-top.webp";
import beforeZoomedIn from "./captures/before-zoomed-in.webp";
import beforeZoomedOut from "./captures/before-zoomed-out.webp";
import { VIEW_LABELS, type View } from "./outlines-tour";

interface Pair {
  view: View;
  note: string;
  before: string;
  after: string;
  /** Pixel size the capture was taken and is shown at. */
  width: number;
  height: number;
}

/**
 * Headless Chrome on the Mac's GPU (ANGLE Metal), 800 x 500 CSS px at 1x, the "Renderer/Outlines" story at the same
 * camera positions: "Before" is main's renderer (1 px `LineSegments`), "After" is R-OUT's with its default settings.
 */
const PAIRS: Pair[] = [
  { view: "top", note: "Straight down, distance 50: a tile is 161 px wide.", before: beforeTop, after: afterTop, width: 800, height: 500 },
  {
    view: "pan",
    note: "The board dragged 2 px at a time from the top view (an animation of six frames, the centre 400 x 250 px at 1:1).",
    before: beforePan,
    after: afterPan,
    width: 400,
    height: 250,
  },
  { view: "default", note: "The game's opening camera, straight down at 240: a tile is 34 px wide here.", before: beforeDefault, after: afterDefault, width: 800, height: 500 },
  { view: "zoomed-out", note: "Distance 300, the farthest, tilted.", before: beforeZoomedOut, after: afterZoomedOut, width: 800, height: 500 },
  { view: "zoomed-in", note: "Distance 5, the closest, tilted, on the tile nearest the board's centre.", before: beforeZoomedIn, after: afterZoomedIn, width: 800, height: 500 },
];

function Capture({ label, src, pair }: { label: "Before" | "After"; src: string; pair: Pair }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="font-mono text-xs text-muted-foreground">{label}</figcaption>
      <img src={src} width={pair.width} height={pair.height} alt={`${label}: ${VIEW_LABELS[pair.view]}`} className="h-auto max-w-full rounded-md border border-border" />
    </figure>
  );
}

/** Each camera position, before and after, side by side. */
function OutlinesComparison() {
  return (
    <div className="flex flex-col gap-8 p-4 text-foreground sm:p-6">
      {PAIRS.map((pair) => (
        <section key={pair.view} className="flex flex-col gap-2">
          <h2 className="text-lg">{VIEW_LABELS[pair.view]}</h2>
          <p className="text-sm text-muted-foreground">{pair.note}</p>
          <div className="flex flex-wrap gap-4">
            <Capture label="Before" src={pair.before} pair={pair} />
            <Capture label="After" src={pair.after} pair={pair} />
          </div>
        </section>
      ))}
    </div>
  );
}

/** The before and after captures of R-OUT, at the same camera positions as the live "Renderer/Outlines" story. */
const meta = {
  title: "Renderer/Outlines comparison",
  component: OutlinesComparison,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OutlinesComparison>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeAndAfter: Story = {};
