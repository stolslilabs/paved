import type { Meta, StoryObj } from "@storybook/react-vite";
import { DirectionRoot } from "./kit";
import { DIRECTIONS, describeDirection } from "./palettes";
import { PalettePanel, StatesPanel } from "./panels";
import { SCREENS_2, type ScreenName2 } from "./screens-2";

const ID = "d" as const;
const dir = DIRECTIONS[ID];

/** Direction D (#537, PR 1b), from the owner's mockups. Check each screen at 375 x 812 first, then 1440 x 900; `Direction/Compare` sets D, E and F side by side. */
const meta = { title: "Direction/D", parameters: { layout: "fullscreen", docs: { description: { component: describeDirection(dir) } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const screen = (name: ScreenName2): Story => {
  const Screen = SCREENS_2[name];
  return {
    render: () => (
      <DirectionRoot id={ID}>
        <Screen />
      </DirectionRoot>
    ),
  };
};

/** The tokens, what the direction takes from Paved's assets and from the mockups, why it is not Cartridge, and the contrast of its states. */
export const Palette: Story = { render: () => <PalettePanel id={ID} /> };
/** White with transparency on every button variant, the cards that are buttons, the switch and the navigation. */
export const States: Story = { render: () => <StatesPanel id={ID} /> };
export const Home: Story = screen("home");
export const Play: Story = screen("play");
/** A tab page. */
export const Ranks: Story = screen("ranks");
export const Settings: Story = screen("settings");
/** The board's HUD with the hand card. */
export const Hud: Story = screen("hud");
export const Score: Story = screen("score");
/** The tile's detail sheet, as the mockups draw it. */
export const Tile: Story = screen("tile");
