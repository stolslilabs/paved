import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../ui/icon";
import { GAME_ICON_SHAPES } from "./game-icon-shapes";
import { GameIcon, type GameIconName, type GameIconSize, type GameTone } from "./game-icon";
import { TOKEN_ICONS, TokenIcon, type TokenKind } from "./token-icon";
import { WorldIcon, type WorldIconName } from "./world-icon";
import { WORLD_ICON_SHAPES } from "./world-icon-shapes";
import { BothThemes } from "../../stories/both-themes";

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

export const Default: Story = {};

/** Every icon of the set at 16, 20, 24, 32, 48 and 64 px, on the app's surface. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-2 rounded-xl bg-background p-3 text-foreground">
      {NAMES.map((name) => (
        <div key={name} className="flex flex-wrap items-end gap-3">
          <span className="w-24 text-xs text-muted-foreground">{name}</span>
          {SIZES.map(({ size, px }) => (
            <span key={px} style={{ fontSize: px, ...room(name) }} className="leading-none">
              <GameIcon name={name} size={size} />
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
};

/** Issue 870's icons: the village, the four structure categories, the season wheel's seasons and its day and night marks. */
const WORLD = Object.keys(WORLD_ICON_SHAPES) as WorldIconName[];
const VILLAGE = "house-tree" as const;
const MORE = [VILLAGE, ...WORLD];

/** Issue 870's eleven icons, one row each, at 16, 20, 24, 32 and 48 px. */
function MoreRows() {
  return MORE.map((name) => (
    <div key={name} className="flex flex-wrap items-end gap-3">
      <span className="w-24 rounded-md bg-background/70 px-1.5 text-xs text-foreground">{name}</span>
      {SIZES.filter((s) => s.px <= 48).map(({ size, px }) =>
        name === VILLAGE ? <GameIcon key={px} name={name} size={size} /> : <WorldIcon key={px} name={name} size={size} />,
      )}
    </div>
  ));
}

/**
 * Issue 870's eleven icons at 16 to 48 px in both themes: the app's dark theme, and the light scope (`stories/both-themes.tsx`; the app
 * ships no light theme yet, so the scope sets the tokens a light block would; the icons keep their own light and ink). The
 * village's is a HUD icon (`GameIcon`), the others the world's (`WorldIcon`, their shapes a file of their own).
 */
export const VillageCategoriesSeasons: Story = {
  render: () => (
    <BothThemes>
      <MoreRows />
    </BothThemes>
  ),
};

/** The same icons on a day and a night sky, the grounds they stand on in the HUD. */
export const VillageCategoriesSeasonsOnSkies: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[SKIES[2]!, SKIES[3]!].map((ground) => (
        <section key={ground.name} aria-label={ground.name} className="flex flex-col gap-2 rounded-xl p-3" style={{ background: ground.background }}>
          <h3 className="self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{ground.name}</h3>
          <MoreRows />
        </section>
      ))}
    </div>
  ),
};

/**
 * Issue 873: the Chests' treasure chest, in the gift's place, and the flat gift the other rewards keep (the missions' bonus, the
 * game over's rewards).
 */
function ChestRow() {
  const sizes = SIZES.filter((s) => s.px <= 48);
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <span className="w-24 rounded-md bg-background/70 px-1.5 text-xs text-foreground">treasure-chest</span>
        {sizes.map(({ size, px }) => (
          <GameIcon key={px} name="treasure-chest" size={size} />
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <span className="w-24 rounded-md bg-background/70 px-1.5 text-xs text-foreground">gift (flat)</span>
        {sizes.map(({ size, px }) => (
          <Icon key={px} name="gift" size={size === "inherit" ? "2xl" : size} fixedWidth className="text-primary" />
        ))}
      </div>
    </>
  );
}

/** The treasure chest at 16 to 48 px on the app's surface and on a day and a night sky, the grounds of the bar and the overlay. */
export const TreasureChest: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <section aria-label="Surface" className="flex flex-col gap-2 rounded-xl bg-background p-3">
        <ChestRow />
      </section>
      {[SKIES[2]!, SKIES[3]!].map((ground) => (
        <section key={ground.name} aria-label={ground.name} className="flex flex-col gap-2 rounded-xl p-3" style={{ background: ground.background }}>
          <h3 className="self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{ground.name}</h3>
          <ChestRow />
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
