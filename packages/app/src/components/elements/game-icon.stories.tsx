import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../ui/icon";
import { GAME_ICON_SHAPES } from "./game-icon-shapes";
import { GameIcon, type GameIconName, type GameIconSize, type GameTone } from "./game-icon";
import { GAME_LOOKS, GameIconLook, type GameLook } from "./game-icon-looks";
import { TOKEN_ICONS, TokenIcon, type TokenKind } from "./token-icon";
import { WorldIcon, type WorldIconName } from "./world-icon";
import { WORLD_ICON_SHAPES } from "./world-icon-shapes";

const meta = {
  title: "Elements/GameIcon",
  component: GameIcon,
  parameters: { layout: "padded" },
  args: { name: "swords", size: "2xl" },
} satisfies Meta<typeof GameIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

const NAMES = Object.keys(GAME_ICON_SHAPES) as GameIconName[];
/** 64 px has no size of its own (the HUD stops at 48): it is the parent's font size. */
const SIZES: readonly { size: GameIconSize; px: number }[] = [
  { size: "sm", px: 16 },
  { size: "md", px: 20 },
  { size: "lg", px: 24 },
  { size: "xl", px: 32 },
  { size: "2xl", px: 48 },
  { size: "inherit", px: 64 },
];
const TONES: readonly GameTone[] = ["gold", "steel", "red", "blue", "green", "wood", "stone", "rose", "orange", "ice", "sprout", "silver", "light", "current"];

/** The home's skies (theme.css, 3b): each season's day and night, the backdrop the HUD's icons stand on. */
const SKIES = ["spring", "summer", "autumn", "winter"].flatMap((season) =>
  (["day", "night"] as const).map((time) => ({
    name: `${season[0]!.toUpperCase()}${season.slice(1)} ${time}`,
    background: `linear-gradient(to bottom, var(--sky-${season}-${time}-top), var(--sky-${season}-${time}-bottom))`,
  })),
);

/** The "+" draws its button past its box (1.75em across, as the plates' square): room for it in a row. */
const room = (name: GameIconName) => (name === "plus" ? { margin: "0.375em 0.25em" } : undefined);

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
          look === "flat" ? <Icon key={name} name={name} size="xl" fixedWidth className="text-primary" /> : (
            <span key={name} style={room(name)} className="inline-flex">
              <GameIconLook name={name} look={look} size="xl" />
            </span>
          ),
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
                <span key={px} style={{ fontSize: px, ...room(name) }} className="leading-none">
                  <GameIconLook name={name} look={look} size={size} />
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
};

/** Issue 870's icons: the village, the four structure categories, the season wheel's seasons and its sun and moon. */
const WORLD = Object.keys(WORLD_ICON_SHAPES) as WorldIconName[];
const VILLAGE = "house-tree" as const;
const MORE = [VILLAGE, ...WORLD];

/**
 * Issue 870's ten icons at 16, 20, 24, 32 and 48 px, on the app's surface and on a day and a night sky (the app has one theme,
 * dark; the skies are the light and dark grounds they stand on in the HUD). The village's is a HUD icon (`GameIcon`), the
 * others the world's (`WorldIcon`, their shapes a file of their own).
 */
export const VillageCategoriesSeasons: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[{ name: "App surface", background: "var(--background)" }, SKIES[2]!, SKIES[3]!].map((ground) => (
        <section key={ground.name} aria-label={ground.name} className="flex flex-col gap-2 rounded-xl p-3" style={{ background: ground.background }}>
          <h3 className="self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{ground.name}</h3>
          {MORE.map((name) => (
            <div key={name} className="flex flex-wrap items-end gap-3">
              <span className="w-24 rounded-md bg-background/70 px-1.5 text-xs text-foreground">{name}</span>
              {SIZES.filter((s) => s.px <= 48).map(({ size, px }) =>
                name === VILLAGE ? <GameIcon key={px} name={name} size={size} /> : <WorldIcon key={px} name={name} size={size} />,
              )}
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
          {TONES.map((tone) => (
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

/**
 * The currencies in the HUD's relief (issue 844), the app's own files (`src/assets/tokens/`), on each of the home's skies at 24 and
 * 48 px. USDC's mark stays unaltered (Circle's guidelines): the outline, the light and the shadow are around it.
 */
export const Currencies: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {SKIES.filter((_, i) => i % 2 === 0 || i === 5).map((sky) => (
        <section key={sky.name} aria-label={sky.name} className="flex flex-col gap-2 rounded-xl p-3" style={{ background: sky.background }}>
          <h3 className="self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{sky.name}</h3>
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(TOKEN_ICONS) as TokenKind[]).flatMap((kind) => (["md", "xl"] as const).map((size) => <TokenIcon key={kind + size} kind={kind} size={size} />))}
          </div>
        </section>
      ))}
    </div>
  ),
};
