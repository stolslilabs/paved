import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES, type LeagueId } from "../../lib/pvp-rules";
import { CrestArt, type CrestArtSize, type CrestDivision } from "./crest-art";
import { CrestDirectionArt, DIRECTIONS, type CrestDirection } from "./crest-directions";
import { LeagueCrest } from "./league-crest";

/**
 * The league crests' second study (#854, its first pull request redone after the owner's "à refaire"): one object per direction, the
 * same base shape for the nine groups, its material climbing wood, iron, bronze, silver, gold, with more ornaments at each step. Three
 * directions, Shield, Helm and Medal, for the owner to answer with one word. `LeagueCrest` draws the pick in the second pull request.
 */
const meta = {
  title: "Elements/CrestDirections",
  component: CrestDirectionArt,
  parameters: { layout: "padded" },
  args: { direction: "shield", league: "gold", division: 2, size: "2xl" },
} satisfies Meta<typeof CrestDirectionArt>;
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
const PX: Record<CrestArtSize, number> = { sm: 16, md: 24, lg: 40, xl: 64, "2xl": 96, inherit: 0 };
/** #854's sizes: 24, 40 and 96 px. */
const SIZES: readonly CrestArtSize[] = ["md", "lg", "2xl"];
/** The home's backgrounds: its sky in each season, by day, and one night (the darkest). */
const SKIES = [
  { name: "Summer day", sky: "summer-day" },
  { name: "Autumn day", sky: "autumn-day" },
  { name: "Winter day", sky: "winter-day" },
  { name: "Spring day", sky: "spring-day" },
  { name: "Summer night", sky: "summer-night" },
] as const;
const skyStyle = (sky: string) => ({ background: `linear-gradient(to bottom, var(--sky-${sky}-top), var(--sky-${sky}-bottom))` });

const Caption = ({ children }: { children: React.ReactNode }) => <span className="text-xs font-semibold text-foreground">{children}</span>;

/** One crest with its name under it; room around it for the outline and the shadow, which pass the 1em box. */
function Cell({ direction, id, name, size, division }: { direction: CrestDirection; id: LeagueId; name: string; size: CrestArtSize; division?: CrestDivision }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5 p-1">
      <span className="leading-none" style={{ padding: `${PX[size] / 5}px` }}>
        <CrestDirectionArt direction={direction} league={id} size={size} division={division} label={`${name} league`} />
      </span>
      <figcaption className="text-xs text-foreground">{name}</figcaption>
    </figure>
  );
}

/** A direction's nine crests, Wood to Grand Master, at 24, 40 and 96 px, on each of the home's skies. */
function Ladder({ direction }: { direction: CrestDirection }) {
  const { name, object } = DIRECTIONS.find((d) => d.id === direction)!;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 max-w-prose text-sm text-foreground">
        <strong>{name}</strong>: {object}, the same shape for the nine groups, its material and ornaments climbing.
      </p>
      {SKIES.map(({ name: sky, sky: id }) => (
        <section key={id} aria-label={sky} className="flex flex-col gap-3 rounded-xl p-3" style={skyStyle(id)}>
          <h3 className="m-0 self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{sky}</h3>
          {SIZES.map((size) => (
            <div key={size} className="flex flex-col gap-1">
              <Caption>{PX[size]} px</Caption>
              <div className="flex flex-wrap items-end gap-2">
                {GROUPS.map((g) => (
                  <Cell key={g.id} direction={direction} id={g.id} name={g.name} size={size} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export const Default: Story = {};

/** Proposal "Shield": a heater shield, plank wood to gold, its field in the league's enamel from Silver. */
export const Shield: Story = { render: () => <Ladder direction="shield" /> };
/** Proposal "Helm": a great helm, leather to gold, its plume in the league's colour from Silver. */
export const Helm: Story = { render: () => <Ladder direction="helm" /> };
/** Proposal "Medal": a round medal, a wooden token to gold, its face in the league's enamel from Silver. */
export const Medal: Story = { render: () => <Ladder direction="medal" /> };

/** The three proposals side by side, group by group, at 40 px on the summer day sky. */
export const Compare: Story = {
  render: () => (
    <div className="flex flex-col gap-2 rounded-xl p-3" style={skyStyle("summer-day")}>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((g) => (
          <section key={g.id} aria-label={g.name} className="flex flex-col items-center gap-1 rounded-lg bg-background/40 p-1.5">
            <div className="flex">
              {DIRECTIONS.map((d) => (
                <span key={d.id} className="p-2 leading-none">
                  <CrestDirectionArt direction={d.id} league={g.id} size="lg" label={`${g.name}, ${d.name}`} />
                </span>
              ))}
            </div>
            <Caption>{g.name}</Caption>
          </section>
        ))}
      </div>
      <p className="m-0 text-xs text-foreground">Each group: Shield, Helm, Medal.</p>
    </div>
  ),
};

/** What each step adds over the one below, the same in the three proposals. */
const GAINS: Record<LeagueId, string> = {
  wood: "bare wood",
  iron: "wood in an iron frame",
  bronze: "iron, rivets, a boss",
  silver: "bronze, the league's colour",
  gold: "silver, rivets",
  platinum: "gold, a coronet",
  diamond: "a ruby, a laurel",
  master: "a crown",
  grandmaster: "a burst, sapphires",
};

/** The ladder in words, the same in the three proposals: what each group adds. */
export const Materials: Story = {
  render: () => (
    <div className="flex max-w-prose flex-col gap-1.5">
      {GROUPS.map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
          <span className="flex leading-none">
            {DIRECTIONS.map((d) => (
              <span key={d.id} className="p-1">
                <CrestDirectionArt direction={d.id} league={g.id} size="md" />
              </span>
            ))}
          </span>
          <strong>{g.name}</strong>
          <span>{GAINS[g.id]}</span>
        </div>
      ))}
    </div>
  ),
};

/** The divisions (#863's studs, kept): Iron to Master in III, II and I on a plate of the group's material, per proposal, at 40 px. */
export const Divisions: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {DIRECTIONS.map((d) => (
        <section key={d.id} aria-label={d.name} className="flex flex-col gap-1 rounded-xl p-3" style={skyStyle("autumn-day")}>
          <Caption>{d.name}</Caption>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {DIVIDED.map((g) => (
              <div key={g.id} className="flex flex-wrap items-end">
                {DIVISIONS.map(({ division, name }) => (
                  <Cell key={division} direction={d.id} id={g.id} name={`${g.name} ${name}`} size="lg" division={division} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};

/** Today's crest (one shield recoloured), the first study (#863, rejected) and the three proposals, at 24 px beside the name. */
export const BesideToday: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Caption>Today: one shield, recoloured</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((g) => (
          <LeagueCrest key={g.id} league={g} size="md" />
        ))}
      </div>
      <Caption>First study (#863): one drawing per group</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((g) => (
          <span key={g.id} className="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-foreground">
            <CrestArt league={g.id} size="md" />
            {g.name}
          </span>
        ))}
      </div>
      {DIRECTIONS.map((d) => (
        <div key={d.id} className="flex flex-col gap-3">
          <Caption>{d.name}</Caption>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {GROUPS.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-foreground">
                <CrestDirectionArt direction={d.id} league={g.id} size="md" />
                {g.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};
