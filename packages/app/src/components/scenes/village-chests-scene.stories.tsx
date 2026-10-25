import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PLAN } from "../../mocks/village";
import { CHESTS, VILLAGE_CHESTS } from "../../mocks/village-v2";
import { CHEST_CHOICES } from "../elements/chest-badge";
import type { ChestDraw } from "../containers/chest-reveal";
import { VillageChestsScene, type ChestTaken, type VillageChestsSceneProps } from "./village-chests-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";

/**
 * The chests (#739, part of #732) on fakes: the chests waiting by rank, the day's PvP chests left, a chest opened. One story
 * per state of `VILLAGE_CHESTS` (`mocks/village-v2.ts`); `Interactive` opens them one after the other.
 */
const meta = {
  title: "Scenes/Village v2/Chests",
  component: VillageChestsScene,
  parameters: { layout: "fullscreen" },
  args: { ...VILLAGE_CHESTS.waiting, tileArt: originalTileArt(SOURCE_ASSETS), onBack: fn(), onNavigate: fn(), onOpen: fn(), onTake: fn(), onDismissRefusal: fn(), onEditLayout: fn() },
} satisfies Meta<typeof VillageChestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three chests waiting (gold, silver, bronze); 1 of today's 3 PvP chests left. */
export const Waiting: Story = { args: VILLAGE_CHESTS.waiting };
/** The gold chest's draw on its way (the VRF). */
export const Opening: Story = { args: VILLAGE_CHESTS.opening };
/** A gold chest opened: keep one of 3 tiles, each with its rarity and how many are held. */
export const Gold: Story = { args: VILLAGE_CHESTS.gold };
/** A tile chosen in the gold chest: Keep. */
export const GoldChosen: Story = { args: VILLAGE_CHESTS.goldChosen };
/** A silver chest: one of 2. */
export const Silver: Story = { args: VILLAGE_CHESTS.silver };
/** A bronze chest: one tile, no choice. */
export const Bronze: Story = { args: VILLAGE_CHESTS.bronze };
/** A chest that held Cobbles besides its tiles. */
export const CobblesWon: Story = { args: VILLAGE_CHESTS.cobbles };
/** The choice on its way. */
export const Taking: Story = { args: VILLAGE_CHESTS.taking };
/** The tile kept, in the inventory (and the Cobbles): Edit layout. */
export const Taken: Story = { args: VILLAGE_CHESTS.taken };
/** Today's 3 PvP chests are won: the time until more. */
export const Capped: Story = { args: VILLAGE_CHESTS.capped };
/** No chest waiting: how to win one. */
export const Empty: Story = { args: VILLAGE_CHESTS.empty };
/** The chain refused: what happened, until dismissed. */
export const Refused: Story = { args: VILLAGE_CHESTS.refused };
export const Loading: Story = { args: VILLAGE_CHESTS.loading };
export const Guest: Story = { args: VILLAGE_CHESTS.guest };

const DRAWS = [PLAN.wonder, PLAN.road, PLAN.cityEdge, PLAN.stopRoads, PLAN.roadCross, PLAN.city];

/** The fakes played: open each chest, keep a tile; the gold one holds Cobbles. */
function Playground(props: VillageChestsSceneProps) {
  const [chests, setChests] = useState(CHESTS);
  const [opened, setOpened] = useState<{ chestId: number; draw: ChestDraw } | null>(null);
  const [taken, setTaken] = useState<ChestTaken | null>(null);
  const open = (id: number) => {
    const chest = chests.find((c) => c.id === id)!;
    setTaken(null);
    setOpened({ chestId: id, draw: { rank: chest.rank, plans: DRAWS.slice(0, CHEST_CHOICES[chest.rank]), cobbles: chest.rank === "gold" ? 50 : null } });
  };
  const take = (id: number, index: number) => {
    if (!opened) return;
    setTaken({ plan: opened.draw.plans[index]!, cobbles: opened.draw.cobbles });
    setOpened(null);
    setChests((c) => c.filter((x) => x.id !== id));
  };
  return <VillageChestsScene {...props} chests={chests} opened={opened} taken={taken} onOpen={open} onTake={take} />;
}

export const Interactive: Story = { render: (args) => <Playground {...args} /> };

/** In the phone's bar (#763): the Chests current at 375 px; from 1440 px the page's top bar alone, as before (#762). */
export const WaitingPhone: Story = { ...Waiting, ...PHONE_375 };
export const WaitingWide: Story = { ...Waiting, ...WIDE_1440 };
