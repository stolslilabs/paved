import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES, type LeagueId } from "../../lib/pvp-rules";
import type { CrestArtSize } from "./crest-art";
import { BadgeCrest } from "./crest-badge";
import { ShieldCrest } from "./crest-shield";
import { LeagueCrest } from "./league-crest";

/**
 * The league crests' fourth study (#854, after the owner turned down #907's shield and swords): graphic league badges, each league its
 * own silhouette, in a material climbing from wood to gold, with a bevel, a sheen, an enamelled field and a cut gem, wings, laurels, a
 * banner and a crown added up the ladder. No weapon. `LeagueCrest` draws the chosen study in the second pull request, after the owner's yes.
 */
const meta = {
  title: "Elements/BadgeCrest",
  component: BadgeCrest,
  parameters: { layout: "padded" },
  args: { league: "gold", size: "2xl" },
} satisfies Meta<typeof BadgeCrest>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The nine leagues, Wood to Grand Master, with their names (the first league of each, without its division). */
const GROUPS = LEAGUES.filter((l, i) => LEAGUES.findIndex((m) => m.id === l.id) === i).map((l) => ({ id: l.id, name: l.name.replace(/ I+$/, "") }));
const PX: Record<CrestArtSize, number> = { sm: 16, md: 24, lg: 40, xl: 64, "2xl": 96, inherit: 0 };
/** The client's sizes: 24, 40 and 96 px. */
const SIZES: readonly CrestArtSize[] = ["md", "lg", "2xl"];
/** The grounds a crest stands on: the app's page, a card, and the home's skies at their lightest and darkest. */
const GROUNDS = [
  { name: "Page", className: "bg-background" },
  { name: "Card", className: "bg-card" },
  { name: "Summer day sky", sky: "summer-day" },
  { name: "Summer night sky", sky: "summer-night" },
] as const;
const groundStyle = (g: (typeof GROUNDS)[number]) =>
  "sky" in g ? { background: `linear-gradient(to bottom, var(--sky-${g.sky}-top), var(--sky-${g.sky}-bottom))` } : undefined;

const Caption = ({ children }: { children: React.ReactNode }) => <span className="text-xs font-semibold text-foreground">{children}</span>;

/** One badge with its name under it; room around it for the outline, the shadow and the wings, which pass the 1em box. */
function Cell({ id, name, size }: { id: LeagueId; name: string; size: CrestArtSize }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5 p-1">
      <span className="leading-none" style={{ padding: `${PX[size] / 5}px` }}>
        <BadgeCrest league={id} size={size} label={`${name} league`} />
      </span>
      <figcaption className="text-xs text-foreground">{name}</figcaption>
    </figure>
  );
}

export const Default: Story = {};

/** The nine badges side by side, Wood to Grand Master, at 24, 40 and 96 px, on each ground. */
export const Ladder: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {GROUNDS.map((g) => (
        <section key={g.name} aria-label={g.name} className={`flex flex-col gap-3 rounded-xl p-3 ${"className" in g ? g.className : ""}`} style={groundStyle(g)}>
          <h3 className="m-0 self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{g.name}</h3>
          {SIZES.map((size) => (
            <div key={size} className="flex flex-col gap-1">
              <Caption>{PX[size]} px</Caption>
              <div className="flex flex-wrap items-end gap-2">
                {GROUPS.map((l) => (
                  <Cell key={l.id} id={l.id} name={l.name} size={size} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
};

/** What each step changes from the one below: its silhouette first, then its material and what it adds. */
const GAINS: Record<LeagueId, string> = {
  wood: "a round wooden buckler: planks, an iron boss, four nails",
  iron: "an iron octagon: a rivet at each corner, a dark field, a diamond boss",
  bronze: "a bronze heater shield: green enamel, an amber stone, gold studs",
  silver: "a silver shield pointed at its top, small wings, blue enamel, a cut sapphire",
  gold: "a gold shield with a crested top, a laurel round it, red enamel, a ruby, a star",
  emerald: "a platinum hexagon in a fuller laurel, teal enamel, a ruby, a red banner",
  diamond: "a cut crystal set in platinum, its facets lit, wider wings, a blue banner",
  master: "a horned gold shield, obsidian, great gold wings, a ruby, a crown, a red banner",
  grandmaster: "the same red-enamelled on a golden burst, wider wings, a diamond, sapphires on its horns, a taller jewelled crown",
};

/** The ladder in words: each league's badge at 40 px and what it changes. */
export const Steps: Story = {
  render: () => (
    <div className="flex max-w-prose flex-col gap-1.5">
      {GROUPS.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
          <span className="p-2 leading-none">
            <BadgeCrest league={l.id} size="lg" />
          </span>
          <strong>{l.name}</strong>
          <span>{GAINS[l.id]}</span>
        </div>
      ))}
    </div>
  ),
};

/** Today's crest (one shield recoloured, `LeagueCrest`), #907's shield and swords and the badges, at 24 px beside the name, then at 40 and 96 px. */
export const BesideStudies: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Caption>Today: one shield, recoloured</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((l) => (
          <LeagueCrest key={l.id} league={l} size="md" />
        ))}
      </div>
      <Caption>#907: shield and swords</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-foreground">
            <ShieldCrest league={l.id} size="md" />
            {l.name}
          </span>
        ))}
      </div>
      <Caption>The study: league badges</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap text-foreground">
            <BadgeCrest league={l.id} size="md" />
            {l.name}
          </span>
        ))}
      </div>
      {(["lg", "2xl"] as const).map((size) => (
        <div key={size} className="flex flex-col gap-2">
          <Caption>Today, #907 and the study at {PX[size]} px</Caption>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {GROUPS.map((l) => (
              <span key={l.id} className="inline-flex flex-wrap items-center gap-3 leading-none" style={{ padding: `${PX[size] / 6}px` }}>
                <LeagueCrest league={l} size={size === "2xl" ? "lg" : "md"} iconOnly />
                <ShieldCrest league={l.id} size={size} label={`${l.name} league, #907`} />
                <BadgeCrest league={l.id} size={size} label={`${l.name} league, the study`} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

// One story per league, at 96 px.
export const Wood: Story = { args: { league: "wood" } };
export const Iron: Story = { args: { league: "iron" } };
export const Bronze: Story = { args: { league: "bronze" } };
export const Silver: Story = { args: { league: "silver" } };
export const Gold: Story = { args: { league: "gold" } };
export const Emerald: Story = { args: { league: "emerald" } };
export const Diamond: Story = { args: { league: "diamond" } };
export const Master: Story = { args: { league: "master" } };
export const GrandMaster: Story = { args: { league: "grandmaster" } };
