import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES, type LeagueId } from "../../lib/pvp-rules";
import type { CrestArtSize } from "./crest-art";
import { ShieldCrest } from "./crest-shield";
import { LeagueCrest } from "./league-crest";

/**
 * The league crests' third study (#854, after the owner turned down #881's Shield, Helm and Medal): a shield and swords for the nine
 * leagues. Wood and Iron a bare shield, Bronze one sword, Silver two crossed, Gold three; from Platinum the four pieces stay while the
 * material and the shapes climb (crenellated, then crowned top; gem pommels; knobbed guards). `LeagueCrest` draws it in the second
 * pull request, after the owner's yes.
 */
const meta = {
  title: "Elements/ShieldCrest",
  component: ShieldCrest,
  parameters: { layout: "padded" },
  args: { league: "gold", size: "2xl" },
} satisfies Meta<typeof ShieldCrest>;
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

/** One crest with its name under it; room around it for the outline and the shadow, which pass the 1em box. */
function Cell({ id, name, size }: { id: LeagueId; name: string; size: CrestArtSize }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5 p-1">
      <span className="leading-none" style={{ padding: `${PX[size] / 5}px` }}>
        <ShieldCrest league={id} size={size} label={`${name} league`} />
      </span>
      <figcaption className="text-xs text-foreground">{name}</figcaption>
    </figure>
  );
}

export const Default: Story = {};

/** The nine crests side by side, Wood to Grand Master, at 24, 40 and 96 px, on each ground. */
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

/** What each step adds over the one below. */
const GAINS: Record<LeagueId, string> = {
  wood: "a wooden shield",
  iron: "an iron shield",
  bronze: "bronze, one sword upright before it",
  silver: "silver, two swords crossed behind it",
  gold: "gold, the three swords",
  platinum: "platinum, a crenellated top",
  diamond: "ice and blue, diamond pommels",
  master: "obsidian in gold, ruby pommels, knobbed guards",
  grandmaster: "red in gold, a crowned top, sapphire pommels",
};

/** The ladder in words: each league's crest at 40 px and what it adds. */
export const Steps: Story = {
  render: () => (
    <div className="flex max-w-prose flex-col gap-1.5">
      {GROUPS.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
          <span className="p-1.5 leading-none">
            <ShieldCrest league={l.id} size="lg" />
          </span>
          <strong>{l.name}</strong>
          <span>{GAINS[l.id]}</span>
        </div>
      ))}
    </div>
  ),
};

/** Today's crest (one shield recoloured, `LeagueCrest`) above the new one, beside the league's name at 24 px, then at 40 px. */
export const BesideToday: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Caption>Today: one shield, recoloured</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((l) => (
          <LeagueCrest key={l.id} league={l} size="md" />
        ))}
      </div>
      <Caption>The study: shield and swords</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-foreground">
            <ShieldCrest league={l.id} size="md" />
            {l.name}
          </span>
        ))}
      </div>
      <Caption>Today and the study at 40 px</Caption>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {GROUPS.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-2 text-xl font-semibold whitespace-nowrap text-foreground">
            <LeagueCrest league={l} size="lg" iconOnly />
            <ShieldCrest league={l.id} size="lg" label={`${l.name} league, the study`} />
          </span>
        ))}
      </div>
    </div>
  ),
};

// One story per league, at 96 px.
export const Wood: Story = { args: { league: "wood" } };
export const Iron: Story = { args: { league: "iron" } };
export const Bronze: Story = { args: { league: "bronze" } };
export const Silver: Story = { args: { league: "silver" } };
export const Gold: Story = { args: { league: "gold" } };
export const Platinum: Story = { args: { league: "platinum" } };
export const Diamond: Story = { args: { league: "diamond" } };
export const Master: Story = { args: { league: "master" } };
export const GrandMaster: Story = { args: { league: "grandmaster" } };
