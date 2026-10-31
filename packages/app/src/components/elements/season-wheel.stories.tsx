import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { fn } from "storybook/test";
import { DAY_SHARE, WHEEL_SEASONS, WHEEL_STATES, initialWheelRound, nextWheelRound, type WheelRound } from "../../data/season-wheel";
import { CENTRE_TURNS, SeasonWheel, type CentreTurn } from "./season-wheel";
import { PHONE_320, VIEWPORT_OPTIONS } from "../scenes/viewports";

const meta = {
  title: "Elements/SeasonWheel",
  component: SeasonWheel,
  parameters: { layout: "padded" },
  args: { state: "auto", point: { season: "summer", position: 0.3 }, onNext: fn() },
  decorators: [(Story) => <div className="inline-block rounded-xl bg-board p-3"><Story /></div>],
} satisfies Meta<typeof SeasonWheel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A 414 px phone: the dial at 108 px. */
const PHONE_414 = {
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, phone414: { name: "Phone 414", styles: { width: "414px", height: "896px" }, type: "mobile" } } } },
  globals: { viewport: { value: "phone414", isRotated: false } },
};

/**
 * Auto, a summer day: the pavers and their gold around the seasons' little planet, the day and night disc at the centre. The
 * gold pointer at the top is on summer's landscape and, by its inner notch, on the disc's day (the sun). No auto mark.
 */
export const Auto: Story = {};
/** Auto, a summer night: the pointer still on summer, its notch on the disc's night (the moon and its stars). */
export const AutoAtNight: Story = { args: { point: { season: "summer", position: 0.8 } } };
export const AutoInAutumn: Story = { args: { point: { season: "autumn", position: 0.3 } } };
export const AutoInAutumnAtNight: Story = { args: { point: { season: "autumn", position: 0.75 } } };
export const AutoInWinter: Story = { args: { point: { season: "winter", position: 0.3 } } };
export const AutoInWinterAtNight: Story = { args: { point: { season: "winter", position: 0.75 } } };
export const AutoInSpring: Story = { args: { point: { season: "spring", position: 0.3 } } };
export const AutoInSpringAtNight: Story = { args: { point: { season: "spring", position: 0.75 } } };
/** A fixed season holds its day: its landscape under the pointer, the disc's day under the notch, at its middle. No fixed mark. */
export const Summer: Story = { args: { state: "summer", point: null } };
export const Autumn: Story = { args: { state: "autumn", point: null } };
export const Winter: Story = { args: { state: "winter", point: null } };
export const Spring: Story = { args: { state: "spring", point: null } };

/** Every state side by side, by day and by night. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {WHEEL_SEASONS.flatMap((s) => [0.3, 0.8].map((position) => <SeasonWheel key={`${s}-${position}`} state="auto" point={{ season: s, position }} />))}
      {WHEEL_STATES.filter((s) => s !== "auto").map((s) => <SeasonWheel key={s} state={s} />)}
    </div>
  ),
};

function Turning_({ centreTurn }: { centreTurn?: CentreTurn }) {
  const [seasons, setSeasons] = useState(0.1);
  // One season in 3 s (the game's takes 120 s): the discs turn as the cycle does at 40x.
  useEffect(() => {
    const id = setInterval(() => setSeasons((p) => p + 0.0333), 100);
    return () => clearInterval(id);
  }, []);
  return <SeasonWheel state="auto" point={{ season: WHEEL_SEASONS[Math.floor(seasons) % 4]!, position: seasons % 1 }} turnMs={100} centreTurn={centreTurn} />;
}

/**
 * The turning discs, sped up: one season in 3 s, the centre disc a whole day and night in the same time, four per year, the
 * other way. The light stays put: only the fixed layers carry it, the landscapes' is their own sky's.
 */
export const Turning: Story = { render: () => <Turning_ /> };
/** The same at 144 px (a tablet), to watch the landscapes and the sun and moon stay upright. */
export const TurningAt144: Story = { render: () => <Turning_ />, globals: { viewport: { value: "tablet", isRotated: false } } };

function Clicks_({ now }: { now: (typeof WHEEL_SEASONS)[number] }) {
  const [round, setRound] = useState<WheelRound>(() => initialWheelRound(true));
  return <SeasonWheel state={round.state} point={{ season: now, position: 0.3 }} onNext={() => setRound((r) => nextWheelRound(r, now))} />;
}

/** Click (#909), the cycle in summer: autumn, winter, spring, summer (now's own season last), and auto on the fifth tap. */
export const Interactive: Story = { render: () => <Clicks_ now="summer" /> };
/** Click, the cycle in winter: spring, summer, autumn, winter, auto. */
export const InteractiveFromWinter: Story = { render: () => <Clicks_ now="winter" /> };

/** The full round from auto in autumn, side by side (#909): auto, then winter, spring, summer, autumn, and auto on the fifth tap. */
export const FullRound: Story = {
  render: () => {
    const rounds = [initialWheelRound(true)];
    for (let i = 0; i < 5; i++) rounds.push(nextWheelRound(rounds.at(-1)!, "autumn"));
    return (
      <div className="flex flex-wrap gap-4">
        {rounds.map((r, i) => (
          <SeasonWheel key={i} state={r.state} point={r.state === "auto" ? { season: "autumn", position: 0.3 } : null} />
        ))}
      </div>
    );
  },
};

function PlayedRound_() {
  const [round, setRound] = useState<WheelRound>(() => initialWheelRound(true));
  // A tap every 1.5 s, the cycle in autumn: the round goes on by itself, the discs always turning forward.
  useEffect(() => {
    const id = setInterval(() => setRound((r) => nextWheelRound(r, "autumn")), 1500);
    return () => clearInterval(id);
  }, []);
  return <SeasonWheel state={round.state} point={{ season: "autumn", position: 0.3 }} />;
}

/** The full round played, a tap every 1.5 s, at 144 px (a tablet): the discs turn on to each season, then on to auto. */
export const PlayedRoundAt144: Story = { render: () => <PlayedRound_ />, globals: { viewport: { value: "tablet", isRotated: false } } };

/** The dial's three sizes (#909's acceptance): 96 px under 390 px wide, 108 px on other phones, 144 px from tablet up. */
export const At96: Story = { ...PHONE_320, args: { point: { season: "winter", position: 0.8 } } };
export const At108: Story = { ...PHONE_414, args: { point: { season: "winter", position: 0.8 } } };
export const At144: Story = { args: { point: { season: "winter", position: 0.8 } }, globals: { viewport: { value: "tablet", isRotated: false } } };

/** Each season's start under the pointer: the landscape blending from one season into the next. */
export const SeasonStarts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {WHEEL_SEASONS.map((s) => <SeasonWheel key={s} state="auto" point={{ season: s, position: 0.999 }} />)}
    </div>
  ),
};

/** The centre disc's four moments: its day, its dusk, its night and its dawn under the notch (a summer, then autumn's dawn). */
const MOMENTS = [
  { name: "Day", point: { season: "summer", position: 0.3 } },
  { name: "Dusk", point: { season: "summer", position: DAY_SHARE } },
  { name: "Night", point: { season: "summer", position: 0.8 } },
  { name: "Dawn", point: { season: "autumn", position: 0 } },
] as const;

function Moments_() {
  return (
    <div className="flex flex-wrap gap-4">
      {MOMENTS.map((m) => (
        <figure key={m.name} className="flex flex-col items-center gap-1">
          <SeasonWheel state="auto" point={m.point} />
          <figcaption className="text-xs text-muted-foreground">{m.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** The centre disc at the dial's three sizes: 96 px (a 320 px phone), 108 px (other phones) and 144 px (a tablet). */
export const DayNightAt96: Story = { ...PHONE_320, render: () => <Moments_ /> };
export const DayNightAt108: Story = { ...PHONE_414, render: () => <Moments_ /> };
export const DayNightAt144: Story = { render: () => <Moments_ />, globals: { viewport: { value: "tablet", isRotated: false } } };

function Directions_({ render }: { render: (turn: CentreTurn) => ReactNode }) {
  return (
    <div className="flex flex-wrap gap-6">
      {CENTRE_TURNS.map((turn) => (
        <figure key={turn} className="flex flex-col items-center gap-2">
          {render(turn)}
          <figcaption className="text-xs text-muted-foreground">{turn === "against" ? "Centre against the seasons (default)" : "Centre with the seasons"}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * The centre disc's two directions sped up, as `Turning`: against the seasons' ring (clockwise, the default), or with it
 * (counterclockwise, the disc drawn mirrored so its night still gives way to its day under the notch).
 */
export const BothDirections: Story = { render: () => <Directions_ render={(turn) => <Turning_ centreTurn={turn} />} /> };
