import type { Meta, StoryObj } from "@storybook/react-vite";
import { DirectionRoot } from "./kit";
import { DIRECTIONS, describeDirection } from "./palettes";
import { PalettePanel, StatesPanel } from "./panels";
import { SCREENS, type ScreenName } from "./screens";

const ID = "c" as const;
const dir = DIRECTIONS[ID];

const meta = { title: "Direction/C", parameters: { layout: "fullscreen", docs: { description: { component: describeDirection(dir) } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const screen = (name: ScreenName): Story => {
  const Screen = SCREENS[name];
  return {
    render: () => (
      <DirectionRoot id={ID}>
        <Screen />
      </DirectionRoot>
    ),
  };
};

/** The tokens, what the direction takes from Paved's assets, why it is not Cartridge, and the contrast of its states. */
export const Palette: Story = { render: () => <PalettePanel id={ID} /> };
/** White with transparency on every button variant, the cards that are buttons, the switch and the navigation. */
export const States: Story = { render: () => <StatesPanel id={ID} /> };
export const Home: Story = screen("home");
export const Play: Story = screen("play");
/** A tab page. */
export const Ranks: Story = screen("ranks");
export const Settings: Story = screen("settings");
/** The board's HUD with the hand panel. */
export const Hud: Story = screen("hud");
export const Score: Story = screen("score");
