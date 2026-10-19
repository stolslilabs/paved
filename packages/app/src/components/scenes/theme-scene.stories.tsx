import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { THEME } from "../../mocks/scenes";
import { ThemeScene } from "./theme-scene";

/**
 * Themes (`/settings/theme`): a card per theme with its real tiles (build-time renders), the tiles owned, Use and the shop;
 * Snow, Desert and Volcano under a blur. One story per state; the viewport is the toolbar's (VP).
 */
const meta = {
  title: "Scenes/Theme",
  component: ThemeScene,
  args: { onUse: fn(), onOpen: fn(), onMyTiles: fn(), onBack: fn(), onNavigate: fn(), onConnect: fn(), onRetry: fn(), onDismissRefusal: fn() },
} satisfies Meta<typeof ThemeScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four Forest tiles owned, two active: a mix, so Use on Forest or Default asks first. */
export const Mixed: Story = { args: THEME.mixed };

/** Forest in use: every owned Forest tile wears it. */
export const ForestInUse: Story = { args: THEME.forestInUse };

/** Nothing owned: Default in use, Forest's Buy tiles. */
export const DefaultInUse: Story = { args: THEME.defaultInUse };

/** The whole Forest set, in use. */
export const AllForest: Story = { args: THEME.allForest };

/** Use's write on its way. */
export const Applying: Story = { args: THEME.applying };

/** Use refused by the chain. */
export const Refused: Story = { args: THEME.refused };

/** A guest: Connect. */
export const Guest: Story = { args: THEME.guest };

/** The skins on their way. */
export const Loading: Story = { args: THEME.loading };

/** A failed read, with Retry. */
export const ReadError: Story = { args: THEME.error };

/** No render served: the board's backdrop. */
export const NoRenders: Story = { args: THEME.noRenders };
