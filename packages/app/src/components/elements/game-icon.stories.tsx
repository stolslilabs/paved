import type { Meta, StoryObj } from "@storybook/react-vite";
import { GameIcon, type GameIconSize } from "./game-icon";
import { TOKEN_ICONS, TokenIcon, type TokenKind } from "./token-icon";
import { WorldIcon, type WorldIconName } from "./world-icon";
import { WORLD_ICON_SHAPES } from "./world-icon-shapes";
import { BothThemes } from "../../stories/both-themes";

const meta = {
  title: "Elements/GameIcon",
  component: GameIcon,
  parameters: { layout: "padded" },
  args: { name: "house-tree", size: "sm" },
} satisfies Meta<typeof GameIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The sizes the app draws them at: 12 px (the end's highlights), 16 px (Found, the closings, the village's notes). */
const SIZES: readonly { size: GameIconSize; px: number }[] = [
  { size: "xs", px: 12 },
  { size: "sm", px: 16 },
];

/** The home's skies (theme.css, 3b): each season's day and night, the backdrop the HUD's icons stand on. */
const SKIES = ["spring", "summer", "autumn", "winter"].flatMap((season) =>
  (["day", "night"] as const).map((time) => ({
    name: `${season[0]!.toUpperCase()}${season.slice(1)} ${time}`,
    background: `linear-gradient(to bottom, var(--sky-${season}-${time}-top), var(--sky-${season}-${time}-bottom))`,
  })),
);

export const Default: Story = {};

/** The icons the app draws (issue 870): the village's house-tree, a HUD icon (`GameIcon`), and the four structure categories (`WorldIcon`). */
const WORLD = Object.keys(WORLD_ICON_SHAPES) as WorldIconName[];
const VILLAGE = "house-tree" as const;
const MORE = [VILLAGE, ...WORLD];

/** One row per icon, at 12 and 16 px. */
function MoreRows() {
  return MORE.map((name) => (
    <div key={name} className="flex flex-wrap items-end gap-3">
      <span className="w-24 rounded-md bg-background/70 px-1.5 text-xs text-foreground">{name}</span>
      {SIZES.map(({ size, px }) => (name === VILLAGE ? <GameIcon key={px} name={name} size={size} /> : <WorldIcon key={px} name={name} size={size} />))}
    </div>
  ));
}

/** Every icon at its sizes, on the app's surface. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-2 rounded-xl bg-background p-3 text-foreground">
      <MoreRows />
    </div>
  ),
};

/**
 * The same in both themes: the app's dark theme, and the light scope (`stories/both-themes.tsx`; the app ships no light theme yet, so
 * the scope sets the tokens a light block would; the icons keep their own light and ink).
 */
export const VillageCategories: Story = {
  render: () => (
    <BothThemes>
      <MoreRows />
    </BothThemes>
  ),
};

/** The same icons on a day and a night sky, the grounds they stand on in the HUD. */
export const VillageCategoriesOnSkies: Story = {
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
 * The currencies (`TokenIcon`, the owner's direction A of 2026-11-01, `token-art.ts`) on each of the home's skies at 24 and 32 px,
 * beside the HUD's icons. USDC's mark stays unaltered (Circle's guidelines): only the coin around it is the game's.
 */
export const Currencies: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {SKIES.filter((_, i) => i % 2 === 0 || i === 5).map((sky) => (
        <section key={sky.name} aria-label={sky.name} className="flex flex-col gap-2 rounded-xl p-3" style={{ background: sky.background }}>
          <h3 className="self-start rounded-md bg-background/70 px-1.5 text-sm font-semibold text-foreground">{sky.name}</h3>
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(TOKEN_ICONS) as TokenKind[]).flatMap((kind) => (["md", "lg"] as const).map((size) => <TokenIcon key={kind + size} kind={kind} size={size} />))}
          </div>
        </section>
      ))}
    </div>
  ),
};
