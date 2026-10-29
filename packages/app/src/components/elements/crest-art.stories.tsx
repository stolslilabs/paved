import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES, type LeagueId } from "../../lib/pvp-rules";
import { CrestArt, STUDS, type CrestArtSize, type CrestDivision } from "./crest-art";
import { LeagueCrest } from "./league-crest";

/**
 * The league crests' study (#854, its first pull request): one crest per group, Wood to Grand Master, each its own drawing in the
 * game icons' relief, and the divisions' studs, for the owner's look. `LeagueCrest` draws them in the second pull request.
 */
const meta = {
  title: "Elements/CrestArt",
  component: CrestArt,
  parameters: { layout: "padded" },
  args: { league: "gold", division: 2, size: "2xl" },
} satisfies Meta<typeof CrestArt>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The nine groups, Wood to Grand Master, with their names (the first league of each, without its division). */
const GROUPS = LEAGUES.filter((l, i) => LEAGUES.findIndex((m) => m.id === l.id) === i).map((l) => ({ id: l.id, name: l.name.replace(/ I+$/, "") }));
/** The groups with three divisions: Iron to Master. */
const DIVIDED = GROUPS.filter((g) => g.id !== "wood" && g.id !== "grandmaster");
const DIVISIONS: readonly { division: CrestDivision; name: string }[] = [
  { division: 3, name: "III" },
  { division: 2, name: "II" },
  { division: 1, name: "I" },
];
/** #854's sizes: 24, 40 and 96 px. */
const PX: Record<CrestArtSize, number> = { sm: 16, md: 24, lg: 40, xl: 64, "2xl": 96, inherit: 0 };
const SIZES: readonly { size: CrestArtSize; px: number }[] = [
  { size: "md", px: 24 },
  { size: "lg", px: 40 },
  { size: "2xl", px: 96 },
];
/** The grounds a crest stands on: the app's own (dark only, theme.css), a card, and the home's summer day sky (the lightest). */
const GROUNDS = [
  { name: "Page", className: "bg-background" },
  { name: "Card", className: "bg-card" },
  { name: "Summer day sky", style: { background: "linear-gradient(to bottom, var(--sky-summer-day-top), var(--sky-summer-day-bottom))" } },
] as const;

const Caption = ({ children }: { children: React.ReactNode }) => <span className="text-xs font-semibold text-foreground">{children}</span>;

/** One group's crest with its name under it; room around it for the outline and the shadow, which pass the 1em box. */
function Cell({ id, name, size, division }: { id: LeagueId; name: string; size: CrestArtSize; division?: CrestDivision }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5 p-1">
      <span className="leading-none" style={{ padding: `${PX[size] / 5}px` }}>
        <CrestArt league={id} size={size} division={division} label={`${name} league`} />
      </span>
      <figcaption className="text-xs text-foreground">{name}</figcaption>
    </figure>
  );
}

export const Default: Story = {};

/** The nine crests side by side, the ladder from Wood to Grand Master, at 24, 40 and 96 px, on each ground. */
export const Ladder: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {GROUNDS.map((ground) => (
        <section key={ground.name} aria-label={ground.name} className={`flex flex-col gap-3 rounded-xl p-3 ${"className" in ground ? ground.className : ""}`} style={"style" in ground ? ground.style : undefined}>
          <h3 className="self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{ground.name}</h3>
          {SIZES.map(({ size, px }) => (
            <div key={size} className="flex flex-col gap-1">
              <Caption>{px} px</Caption>
              <div className="flex flex-wrap items-end gap-2">
                {GROUPS.map((g) => (
                  <Cell key={g.id} id={g.id} name={g.name} size={size} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
};

/**
 * The divisions (#854's proposal 3): Iron to Master in III, II and I, one to three studs on a plate at the crest's foot, so a
 * division change shows without the name. III has one stud, I three: the climb adds a stud.
 */
export const Divisions: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {SIZES.map(({ size, px }) => (
        <div key={size} className="flex flex-col gap-1">
          <Caption>{px} px</Caption>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {DIVIDED.map((g) => (
              <div key={g.id} className="flex flex-wrap items-end">
                {DIVISIONS.map(({ division, name }) => (
                  <Cell key={division} id={g.id} name={`${g.name} ${name}`} size={size} division={division} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="m-0 max-w-prose text-xs text-muted-foreground">
        Studs: III {STUDS[3]}, II {STUDS[2]}, I {STUDS[1]}. Wood and Grand Master have no division.
      </p>
    </div>
  ),
};

/** Today's crest (one shield recoloured, `LeagueCrest`) above the new ones, at 24 px, beside the league's name. */
export const BesideToday: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Caption>Today: one shield, recoloured</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((g) => (
          <LeagueCrest key={g.id} league={g} size="md" />
        ))}
      </div>
      <Caption>The study: one crest per group</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((g) => (
          <span key={g.id} className="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-foreground">
            <CrestArt league={g.id} size="md" />
            {g.name}
          </span>
        ))}
      </div>
    </div>
  ),
};

// One story per group, at 96 px, in its top division (none for Wood and Grand Master).
export const Wood: Story = { args: { league: "wood", division: undefined } };
export const Iron: Story = { args: { league: "iron", division: 1 } };
export const Bronze: Story = { args: { league: "bronze", division: 1 } };
export const Silver: Story = { args: { league: "silver", division: 1 } };
export const Gold: Story = { args: { league: "gold", division: 1 } };
export const Platinum: Story = { args: { league: "platinum", division: 1 } };
export const Diamond: Story = { args: { league: "diamond", division: 1 } };
export const Master: Story = { args: { league: "master", division: 1 } };
export const GrandMaster: Story = { args: { league: "grandmaster", division: undefined } };
