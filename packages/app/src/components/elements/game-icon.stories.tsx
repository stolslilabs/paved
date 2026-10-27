import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../ui/icon";
import { GAME_ICON_SHAPES } from "./game-icon-shapes";
import { GAME_LOOKS, GAME_TONES, GameIcon, type GameIconName, type GameIconSize, type GameLook } from "./game-icon";

const meta = {
  title: "Elements/GameIcon",
  component: GameIcon,
  parameters: { layout: "padded" },
  args: { name: "swords", size: "2xl" },
} satisfies Meta<typeof GameIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

const NAMES = Object.keys(GAME_ICON_SHAPES) as GameIconName[];
const SIZES: readonly { size: GameIconSize; px: number }[] = [
  { size: "sm", px: 16 },
  { size: "md", px: 20 },
  { size: "lg", px: 24 },
  { size: "xl", px: 32 },
  { size: "2xl", px: 48 },
  { size: "3xl", px: 64 },
];

/** The home's skies (theme.css, 3b): each season's day and night, the backdrop the HUD's icons stand on. */
const SKIES = ["spring", "summer", "autumn", "winter"].flatMap((season) =>
  (["day", "night"] as const).map((time) => ({
    name: `${season[0]!.toUpperCase()}${season.slice(1)} ${time}`,
    background: `linear-gradient(to bottom, var(--sky-${season}-${time}-top), var(--sky-${season}-${time}-bottom))`,
  })),
);

const LOOK_NAMES: Record<GameLook | "flat", string> = {
  flat: "Flat (today's Icon)",
  relief: "Relief: soft gradient, light on the edges",
  gloss: "Gloss: two-step fill, light on the top half",
  toon: "Toon: flat tones",
};

/** One row of the set in a look; `flat` draws today's Font Awesome icon in the text's gold. */
function Row({ look }: { look: GameLook | "flat" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-foreground">{LOOK_NAMES[look]}</span>
      <div className="flex flex-wrap gap-3">
        {NAMES.map((name) =>
          look === "flat" ? <Icon key={name} name={name} size="xl" fixedWidth className="text-primary" /> : <GameIcon key={name} name={name} look={look} size="xl" />,
        )}
      </div>
    </div>
  );
}

export const Default: Story = {};

/**
 * The owner's pick (#844): the three looks, and today's flat icons above them, on each of the home's skies. `relief` is the
 * default the HUD uses until the owner picks.
 */
export const Looks: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {SKIES.map((sky) => (
        <section key={sky.name} aria-label={sky.name} className="flex flex-col gap-3 rounded-xl p-3" style={{ background: sky.background }}>
          <h3 className="rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground self-start">{sky.name}</h3>
          {(["flat", ...GAME_LOOKS] as const).map((look) => (
            <Row key={look} look={look} />
          ))}
        </section>
      ))}
    </div>
  ),
};

/** Every icon of the set at 16, 20, 24, 32, 48 and 64 px, in each look, on the app's surface. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 rounded-xl bg-background p-3 text-foreground">
      {GAME_LOOKS.map((look) => (
        <section key={look} aria-label={look} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{LOOK_NAMES[look]}</h3>
          {NAMES.map((name) => (
            <div key={name} className="flex flex-wrap items-end gap-3">
              <span className="w-24 text-xs text-muted-foreground">{name}</span>
              {SIZES.map(({ size, px }) => (
                <GameIcon key={px} name={name} look={look} size={size} />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
};

/** One icon in every tone of the palette (`current` takes the text's colour: a league's crest). */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-col gap-3 rounded-xl bg-background p-3 text-foreground">
      {(["shield-halved", "trophy"] as const).map((name) => (
        <div key={name} className="flex flex-wrap gap-3">
          {GAME_TONES.map((tone) => (
            <span key={tone} className="flex w-12 flex-col items-center gap-1 text-info">
              <GameIcon name={name} tone={tone} size="xl" />
              <span className="text-xs text-muted-foreground">{tone}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
};
