import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { angledTileArt } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { CHESTS } from "../../mocks/village-v2";
import { ChestModal } from "./chest-modal";

const EPIC = { chestId: 41, draw: { rank: "epic", plans: [PLAN.road, PLAN.wonder, PLAN.cityEdge] } } as const;

/**
 * A ready chest's opening (#784), frame by frame for the owner to judge: the chest shaking at the centre ("Tap to open"), its
 * draw on its way, the lid's burst held at its peak, the tiles out and the choice, the tile kept with Claim. The
 * sounds (`shake`, `burst`, `flip`, `keep`) play with the sound effects on, after a first tap in the canvas.
 */
const meta = {
  title: "Containers/ChestModal",
  component: ChestModal,
  parameters: { sfx: 0.8 },
  args: {
    open: true,
    chest: CHESTS[0]!,
    more: 2,
    opened: null,
    opening: false,
    taken: null,
    tileArt: angledTileArt,
    onClose: fn(),
    onOpen: fn(),
    onTake: fn(),
    onDismissRefusal: fn(),
  },
} satisfies Meta<typeof ChestModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1. The chest at the centre: a few short shakes, a pause, again. */
export const Shaking: Story = {};
/** 2. Tapped: its draw on its way, it shakes faster. */
export const Opening: Story = { args: { opening: true } };
/** 3. The lid's burst, held at its peak: the flash and the rays in the epic's colour. */
export const Burst: Story = { args: { opened: EPIC, held: true } };
/** 4. The tiles out of the chest, the book's cards: "Choose 1 of 3". */
export const Epic: Story = { args: { opened: EPIC } };
/** A tile chosen: its card in gold, Take. */
export const EpicChosen: Story = { args: { opened: EPIC, initialChoice: 1 } };
export const Rare: Story = { args: { chest: CHESTS[1]!, opened: { chestId: 40, draw: { rank: "rare", plans: [PLAN.roadCross, PLAN.stopRoads] } } } };
export const Basic: Story = { args: { chest: CHESTS[2]!, more: 0, opened: { chestId: 39, draw: { rank: "basic", plans: [PLAN.forestCity] } } } };
/** 5. The tile kept, on its gold card: Claim, back to the game's end (the owner's ask of 2026-11-06). */
export const Taken: Story = { args: { taken: { plan: PLAN.wonder } } };
/** A Story chest, which takes no slot. */
export const StoryChest: Story = { args: { chest: CHESTS[2]!, more: 0 } };
export const Refused: Story = { args: { refusal: "This chest was opened already. Nothing was taken." } };
/** Under reduced motion: no shake, the tiles fade in. */
export const Reduced: Story = { args: { opened: EPIC }, parameters: { reducedMotion: "always" } };
