import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../ui/button";
import { ChestArt, type ChestArtState } from "./chest-art";
import { CHEST_NAME, ChestBadge, type ChestRank } from "./chest-badge";
import { CHEST_DIRECTIONS, CHEST_RANKS, type ChestDirection } from "./chest-designs";
import { ChestIcon, type ChestIconSize } from "./chest-icon";

/**
 * The chests' study (#874, its first pull request): three directions, A wooden chests with metal bands, B treasure coffers,
 * C voxel chests, each in Bronze, Silver and Gold and in two versions, the simple icon (`ChestIcon`) and the detailed art that
 * opens (`ChestArt`), on the Chests page's background, for the owner to pick (or mix). Nothing in the app draws them yet: the
 * second pull request wires the chosen direction into the slots, the modal, `ChestBadge` and the battle logs.
 */
const meta = {
  title: "Elements/ChestArt",
  component: ChestArt,
  parameters: { layout: "padded" },
  args: { direction: "wood", rank: "gold", state: "rest", size: "lg" },
  argTypes: {
    direction: { control: "inline-radio", options: CHEST_DIRECTIONS.map((d) => d.id) },
    rank: { control: "inline-radio", options: CHEST_RANKS },
    state: { control: "inline-radio", options: ["rest", "ready", "opening", "open", "spent"] },
  },
} satisfies Meta<typeof ChestArt>;
export default meta;
type Story = StoryObj<typeof meta>;

const RANK_LABEL: Record<ChestRank, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };
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

/** A direction's card: its letter, its name and what it draws. */
function DirectionCard({ direction, children }: { direction: ChestDirection; children: React.ReactNode }) {
  const d = CHEST_DIRECTIONS.find((x) => x.id === direction)!;
  return (
    <section aria-label={`${d.letter}. ${d.name}`} className="flex flex-col gap-3 rounded-2xl bg-card p-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 font-display text-lg text-foreground">
          {d.letter}. {d.name}
        </h3>
        <p className="m-0 max-w-prose text-xs text-muted-foreground">{d.note}</p>
      </div>
      {children}
    </section>
  );
}

export const Default: Story = {};

// One story per state of the detailed art, a gold wooden chest.
export const Rest: Story = { args: { state: "rest" } };
export const Ready: Story = { args: { state: "ready" } };
export const Opening: Story = { args: { state: "opening" } };
export const Open: Story = { args: { state: "open" } };
/** #874's open point 2: the slots' opened chest, open and empty, grey. */
export const Spent: Story = { args: { state: "spent" } };

/** The three directions side by side: each rank's simple icon at 16, 24 and 48 px beside its detailed art at rest. */
export const Directions: Story = {
  render: () => (
    <div className="flex flex-col gap-3 bg-background">
      {CHEST_DIRECTIONS.map((d) => (
        <DirectionCard key={d.id} direction={d.id}>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CHEST_RANKS.map((rank) => (
              <figure key={rank} className="m-0 flex flex-col items-center gap-1.5">
                <ChestArt direction={d.id} rank={rank} size="md" label={`${CHEST_NAME[rank]}, direction ${d.letter}`} />
                <span className="flex items-end gap-2">
                  <ChestIcon direction={d.id} rank={rank} size="sm" label={null} />
                  <ChestIcon direction={d.id} rank={rank} size="md" label={null} />
                  <ChestIcon direction={d.id} rank={rank} size="xl" label={null} />
                </span>
                <figcaption className="text-xs text-foreground">{RANK_LABEL[rank]}</figcaption>
              </figure>
            ))}
          </div>
        </DirectionCard>
      ))}
    </div>
  ),
};

/** One chest that opens on a tap and closes again, to replay the opening. */
function Openable({ direction, rank }: { direction: ChestDirection; rank: ChestRank }) {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState(0);
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
        <ChestArt key={run} direction={direction} rank={rank} state={open ? "opening" : "ready"} size="md" label={null} />
      </button>
      <span className="text-xs text-foreground">{RANK_LABEL[rank]}</span>
    </div>
  );
}

/**
 * The opening (#874's proposal 4): tap a chest to open it, the lid swings and the light bursts in the rank's colour; tap again to
 * close it and replay. "Open all" opens the nine at once.
 */
export const TapToOpen: Story = {
  render: function Render() {
    const [all, setAll] = useState(0);
    return (
      <div className="flex flex-col gap-3 bg-background">
        <Button size="sm" variant="outline" className="self-start" onClick={() => setAll(all + 1)}>
          Open all
        </Button>
        {CHEST_DIRECTIONS.map((d) => (
          <DirectionCard key={d.id} direction={d.id}>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              {CHEST_RANKS.map((rank) =>
                all > 0 ? (
                  <div key={`${rank}${all}`} className="flex flex-col items-center gap-1">
                    <ChestArt direction={d.id} rank={rank} state="opening" size="md" />
                    <span className="text-xs text-foreground">{RANK_LABEL[rank]}</span>
                  </div>
                ) : (
                  <Openable key={rank} direction={d.id} rank={rank} />
                ),
              )}
            </div>
          </DirectionCard>
        ))}
      </div>
    );
  },
};

/** The opening under reduced motion: still frames, the light only fades in, nothing shakes, turns or flies. */
export const ReducedMotion: Story = { ...TapToOpen, parameters: { reducedMotion: "always" } };

/** Each direction's ranks in each state: at rest, ready (shaking), open in its light, opened and grey. */
function StatesOf({ direction }: { direction: ChestDirection }) {
  return (
    <DirectionCard direction={direction}>
      {CHEST_RANKS.map((rank) => (
        <div key={rank} className="flex flex-col gap-1">
          <Caption>{RANK_LABEL[rank]}</Caption>
          <div className="flex flex-wrap gap-x-2 gap-y-2">
            {STATES.map(({ state, name }) => (
              <figure key={state} className="m-0 flex flex-col items-center gap-1">
                <ChestArt direction={direction} rank={rank} state={state} size="sm" label={`${CHEST_NAME[rank]}, ${name.toLowerCase()}`} />
                <figcaption className="text-xs text-foreground">{name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </DirectionCard>
  );
}
export const WoodStates: Story = { render: () => <StatesOf direction="wood" /> };
export const CofferStates: Story = { render: () => <StatesOf direction="coffer" /> };
export const VoxelStates: Story = { render: () => <StatesOf direction="voxel" /> };

/** The grounds an icon stands on: the page, a card, the home's summer day sky (the lightest). */
const GROUNDS = [
  { name: "Page", className: "bg-background" },
  { name: "Card", className: "bg-card" },
  { name: "Summer day sky", style: { background: "linear-gradient(to bottom, var(--sky-summer-day-top), var(--sky-summer-day-bottom))" } },
] as const;

/** The simple icons from 16 to 48 px on each ground: the ranks told apart by their ornaments as well as their colours. */
export const Icons: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {GROUNDS.map((ground) => (
        <section
          key={ground.name}
          aria-label={ground.name}
          className={`flex flex-col gap-3 rounded-xl p-3 ${"className" in ground ? ground.className : ""}`}
          style={"style" in ground ? ground.style : undefined}
        >
          <h3 className="m-0 self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{ground.name}</h3>
          {CHEST_DIRECTIONS.map((d) => (
            <div key={d.id} className="flex flex-col gap-1">
              <span className="self-start rounded-md bg-background/70 px-1.5 text-xs font-semibold text-foreground">
                {d.letter}. {d.name}
              </span>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                {ICON_SIZES.map(({ size, px }) => (
                  <span key={size} className="inline-flex items-end gap-1.5" title={`${px} px`}>
                    {CHEST_RANKS.map((rank) => (
                      <ChestIcon key={rank} direction={d.id} rank={rank} size={size} />
                    ))}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
};

/** Today's chest (`ChestBadge`, the flat icon in the medal's colour) above the simple icons, and the icons in a line of text, as the battle logs and the explanations show them. */
export const BesideToday: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Caption>Today: the flat icon, recoloured</Caption>
      <div className="flex flex-wrap gap-2">
        {CHEST_RANKS.map((rank) => (
          <ChestBadge key={rank} rank={rank} size="sm" />
        ))}
      </div>
      {CHEST_DIRECTIONS.map((d) => (
        <div key={d.id} className="flex flex-col gap-1">
          <Caption>
            {d.letter}. {d.name}
          </Caption>
          <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground">
            {CHEST_RANKS.map((rank) => (
              <span key={rank} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <ChestIcon direction={d.id} rank={rank} size="sm" label={null} />
                {CHEST_NAME[rank]} won
              </span>
            ))}
          </p>
        </div>
      ))}
    </div>
  ),
};
