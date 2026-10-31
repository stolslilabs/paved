import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../ui/button";
import { ChestArt, type ChestArtState } from "./chest-art";
import { CHEST_NAME, ChestBadge, type ChestRank } from "./chest-badge";
import { CHEST_ART_REM, CHEST_RANKS } from "./chest-designs";
import { chestImageUrl } from "./chest-images";
import { ChestIcon, type ChestIconSize } from "./chest-icon";

/**
 * The chests (the owner's direction of 2026-10-31, `docs/design/chests.webp`): images in a Supercell-like mobile game's rendering,
 * basic oak and iron, rare silver and sapphire, epic gold, crown and rubies, in two versions, the icon (`ChestIcon`) and the art that
 * opens (`ChestArt`): it crouches, springs and pops its lid on its hinges in a flash, the light bursts in the rank's colour, it lands in
 * a puff of dust. The app draws the icon in `ChestBadge` and the battle logs, the art in the chest slots and the opening's modal.
 */
const meta = {
  title: "Elements/ChestArt",
  component: ChestArt,
  parameters: { layout: "padded" },
  args: { rank: "epic", state: "rest", size: "lg" },
  argTypes: {
    rank: { control: "inline-radio", options: CHEST_RANKS },
    state: { control: "inline-radio", options: ["rest", "ready", "opening", "open", "spent"] },
    drop: { control: "boolean" },
  },
} satisfies Meta<typeof ChestArt>;
export default meta;
type Story = StoryObj<typeof meta>;

const RANK_LABEL: Record<ChestRank, string> = { basic: "Basic", rare: "Rare", epic: "Epic" };
const STATES: readonly { state: ChestArtState; name: string }[] = [
  { state: "rest", name: "At rest" },
  { state: "ready", name: "Ready" },
  { state: "open", name: "Open" },
  { state: "spent", name: "Opened" },
];
/** #874's range for the simple version: 16 to 48 px. */
const ICON_SIZES: readonly { size: ChestIconSize; px: number }[] = [
  { size: "sm", px: 16 },
  { size: "md", px: 24 },
  { size: "lg", px: 32 },
  { size: "xl", px: 48 },
];

const Caption = ({ children }: { children: React.ReactNode }) => <span className="text-xs font-semibold text-muted-foreground">{children}</span>;

export const Default: Story = {};

// One story per state of the detailed art, an epic chest.
export const Rest: Story = { args: { state: "rest" } };
export const Ready: Story = { args: { state: "ready" } };
export const Opening: Story = { args: { state: "opening" } };
export const Open: Story = { args: { state: "open" } };
/** #874's open point 2: the slots' opened chest, open and empty, grey. */
export const Spent: Story = { args: { state: "spent" } };

/** The three ranks side by side: each one's simple icon at 16, 24 and 48 px beside its detailed art at rest. */
export const Ranks: Story = {
  render: () => (
    <div className="flex flex-wrap gap-x-4 gap-y-3 rounded-2xl bg-card p-3">
      {CHEST_RANKS.map((rank) => (
        <figure key={rank} className="m-0 flex flex-col items-center gap-1.5">
          <ChestArt rank={rank} size="sm" label={CHEST_NAME[rank]} />
          <span className="flex items-end gap-2">
            <ChestIcon rank={rank} size="sm" label={null} />
            <ChestIcon rank={rank} size="md" label={null} />
            <ChestIcon rank={rank} size="xl" label={null} />
          </span>
          <figcaption className="text-xs text-foreground">{RANK_LABEL[rank]}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

/** The layers of each rank on a card, as the client lays them: the closed chest; the raised lid, then the body over it; the two together. */
export const Layers: Story = {
  render: () => (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-3">
      {CHEST_RANKS.map((rank) => (
        <div key={rank} className="flex flex-col gap-1">
          <Caption>{RANK_LABEL[rank]}</Caption>
          <div className="flex flex-wrap gap-x-2 gap-y-2">
            {[["closed"], ["lid"], ["body"], ["lid", "body"]].map((layers) => (
              <figure key={layers.join("+")} className="m-0 flex flex-col items-center gap-1">
                <span className="relative block" style={{ width: `${CHEST_ART_REM.sm}rem`, height: `${CHEST_ART_REM.sm}rem` }}>
                  {layers.map((layer) => (
                    <img key={layer} alt="" src={chestImageUrl(rank, layer as "closed" | "lid" | "body", 320)} className="absolute inset-0 size-full" />
                  ))}
                </span>
                <figcaption className="text-xs text-foreground">{layers.join(" + ")}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

/** The modal's arrival: the chest drops in, lands in a puff of dust, then shakes. Replay with the button. */
export const Drop: Story = {
  render: function Render() {
    const [run, setRun] = useState(0);
    return (
      <div className="flex flex-col gap-3 bg-background">
        <Button size="sm" variant="outline" className="self-start" onClick={() => setRun(run + 1)}>
          Drop again
        </Button>
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-card p-6">
          {CHEST_RANKS.map((rank) => (
            <ChestArt key={`${rank}-${run}`} rank={rank} state="ready" drop size="md" label={CHEST_NAME[rank]} />
          ))}
        </div>
      </div>
    );
  },
};

/** One chest that opens on a tap and closes again, to replay the opening; each new `opens` (the "Open all" button's count) opens it too. */
function Openable({ rank, opens }: { rank: ChestRank; opens: number }) {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState(0);
  const [seen, setSeen] = useState(opens);
  if (opens !== seen) {
    setSeen(opens);
    setOpen(true);
    setRun(run + 1);
  }
  const name = CHEST_NAME[rank].toLowerCase();
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={open ? `Close the ${name}` : `Open the ${name}`}
        aria-pressed={open}
        onClick={() => {
          setOpen(!open);
          setRun(run + 1);
        }}
        className="grid place-items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChestArt key={run} rank={rank} state={open ? "opening" : "ready"} size="sm" label={null} />
      </button>
      <span className="text-xs text-foreground">{RANK_LABEL[rank]}</span>
    </div>
  );
}

/**
 * The opening: tap a chest to open it, it crouches and springs, its lid pops up on its hinges in a flash, the light bursts in the
 * rank's colour and it lands in a puff of dust; tap again to close it and replay. "Open all" opens the three at once (again on each press).
 */
export const TapToOpen: Story = {
  render: function Render() {
    const [all, setAll] = useState(0);
    return (
      <div className="flex flex-col gap-3 bg-background">
        <Button size="sm" variant="outline" className="self-start" onClick={() => setAll(all + 1)}>
          Open all
        </Button>
        <div className="flex flex-wrap gap-x-3 gap-y-2 rounded-2xl bg-card p-3">
          {CHEST_RANKS.map((rank) => (
            <Openable key={rank} rank={rank} opens={all} />
          ))}
        </div>
      </div>
    );
  },
};

/** The opening under reduced motion: still frames, the chest open at once, the light only fades in, nothing shakes, turns or flies. */
export const ReducedMotion: Story = { ...TapToOpen, parameters: { reducedMotion: "always" } };

/** Each rank in each state: at rest, ready (shaking), open in its light, opened and grey. */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-3">
      {CHEST_RANKS.map((rank) => (
        <div key={rank} className="flex flex-col gap-1">
          <Caption>{RANK_LABEL[rank]}</Caption>
          <div className="flex flex-wrap gap-x-2 gap-y-2">
            {STATES.map(({ state, name }) => (
              <figure key={state} className="m-0 flex flex-col items-center gap-1">
                <ChestArt rank={rank} state={state} size="xs" label={`${CHEST_NAME[rank]}, ${name.toLowerCase()}`} />
                <figcaption className="text-xs text-foreground">{name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

/** The grounds an icon stands on: the page, a card, the home's summer day sky (the lightest). */
const GROUNDS = [
  { name: "Page", className: "bg-background" },
  { name: "Card", className: "bg-card" },
  { name: "Summer day sky", style: { background: "linear-gradient(to bottom, var(--sky-summer-day-top), var(--sky-summer-day-bottom))" } },
] as const;

/** The icons from 16 to 48 px on each ground: the ranks told apart by their silhouettes as well as their colours. */
export const Icons: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {GROUNDS.map((ground) => (
        <section
          key={ground.name}
          aria-label={ground.name}
          className={`flex flex-col gap-2 rounded-xl p-3 ${"className" in ground ? ground.className : ""}`}
          style={"style" in ground ? ground.style : undefined}
        >
          <h3 className="m-0 self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{ground.name}</h3>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            {ICON_SIZES.map(({ size, px }) => (
              <span key={size} className="inline-flex items-end gap-1.5" title={`${px} px`}>
                {CHEST_RANKS.map((rank) => (
                  <ChestIcon key={rank} rank={rank} size={size} />
                ))}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};

/** `ChestBadge` on the icons, in its four sizes, and the icons in a line of text, as the battle logs and the explanations show them. */
export const InBadgesAndText: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Caption>ChestBadge</Caption>
      <div className="flex flex-wrap items-end gap-2">
        {(["sm", "md", "lg", "xl"] as const).map((size) => (
          <span key={size} className="inline-flex flex-wrap items-end gap-2">
            {CHEST_RANKS.map((rank) => (
              <ChestBadge key={rank} rank={rank} size={size} glow={size === "xl"} />
            ))}
          </span>
        ))}
      </div>
      <Caption>Opened</Caption>
      <div className="flex flex-wrap gap-2">
        {CHEST_RANKS.map((rank) => (
          <ChestBadge key={rank} rank={rank} size="sm" open />
        ))}
      </div>
      <Caption>In a line of text</Caption>
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground">
        {CHEST_RANKS.map((rank) => (
          <span key={rank} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <ChestIcon rank={rank} size="sm" label={null} />
            {CHEST_NAME[rank]} won
          </span>
        ))}
      </p>
    </div>
  ),
};
