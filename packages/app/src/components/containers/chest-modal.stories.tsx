import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { CHESTS } from "../../mocks/village-v2";
import { ChestModal } from "./chest-modal";

const EPIC = { chestId: 41, draw: { rank: "epic", plans: [PLAN.road, PLAN.wonder, PLAN.cityEdge], cobbles: null } } as const;

/**
 * A ready chest's opening (#784), frame by frame for the owner to judge: the chest shaking at the centre ("Tap to open"), its
 * draw on its way, the lid's burst held at its peak, the tiles out and the choice, the tile kept with Next chest or Done. The
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
    owned: { [PLAN.road]: 9, [PLAN.cityEdge]: 4 },
    tileArt: originalTileArt(SOURCE_ASSETS),
    onClose: fn(),
    onOpen: fn(),
    onTake: fn(),
    onNext: fn(),
    onEditLayout: fn(),
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
/** 4. The tiles out of the chest, side by side: keep one of 3. */
export const Epic: Story = { args: { opened: EPIC } };
/** A tile chosen: Keep. */
export const EpicChosen: Story = { args: { opened: EPIC, initialChoice: 1 } };
export const Rare: Story = { args: { chest: CHESTS[1]!, opened: { chestId: 40, draw: { rank: "rare", plans: [PLAN.roadCross, PLAN.stopRoads], cobbles: null } } } };
export const Basic: Story = { args: { chest: CHESTS[2]!, more: 0, opened: { chestId: 39, draw: { rank: "basic", plans: [PLAN.forestCity], cobbles: null } } } };
/** The Cobbles the chest held, after its tiles. */
export const CobblesWon: Story = { args: { opened: { ...EPIC, draw: { ...EPIC.draw, cobbles: 50 } } } };
/** 5. The tile kept: Next chest while others wait, or Later. */
export const TakenNext: Story = { args: { taken: { plan: PLAN.wonder, cobbles: 50 } } };
/** The last one kept: Done, Edit layout. */
export const TakenLast: Story = { args: { chest: null, more: 0, taken: { plan: PLAN.forestCity, cobbles: null } } };
/** A Story chest, which takes no slot. */
export const StoryChest: Story = { args: { chest: CHESTS[2]!, more: 0 } };
export const Refused: Story = { args: { refusal: "This chest was opened already. Nothing was taken." } };
/** Under reduced motion: no shake, the tiles fade in. */
export const Reduced: Story = { args: { opened: EPIC }, parameters: { reducedMotion: "always" } };
