import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HOME_VILLAGE, LAYOUT_GROWING, LAYOUT_SLOTS } from "../../mocks/village-v2";
import { layoutScore } from "../containers/layout-rules";
import type { LayoutSlot } from "../containers/layout-slots-strip";
import VillageStage from "../containers/village-stage";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";
import { PHONE_320, PHONE_375, WIDE_1440 } from "./viewports";
import { HOME_STORY_META, slots } from "./home-village-story-kit";

/** Home (`/`, #753): the saved layouts (#804) in edit mode's carousel. */
const meta = {
  title: "Scenes/Home",
  ...HOME_STORY_META,
} satisfies Meta<typeof HomeVillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The saved layouts (#804) in the carousel above the inventory: layout 1 (the village's, Active), Next on to locked layout 2. */
export const SlotsOne: Story = { ...slots(HOME_VILLAGE.slotsOne) };
export const SlotsOnePhone375: Story = { ...PHONE_375, ...slots(HOME_VILLAGE.slotsOne) };
export const SlotsOneWide1440: Story = { ...WIDE_1440, ...slots(HOME_VILLAGE.slotsOne) };
/** Three layouts, the die's village in layout 2 shown and loaded: Use in the bar, both arrows on. */
export const SlotsThree: Story = { ...slots(HOME_VILLAGE.slotsThree) };
export const SlotsThreePhone375: Story = { ...PHONE_375, ...slots(HOME_VILLAGE.slotsThree) };
export const SlotsThreeWide1440: Story = { ...WIDE_1440, ...slots(HOME_VILLAGE.slotsThree) };
/** Layout 2 locked, shown: its Purchase in its word's place (the padlock, the Cobbles and its price), Next on to layout 3. */
export const SlotsLocked: Story = { ...slots(HOME_VILLAGE.slotsLocked) };
/** Layout 3 bought before layout 2 (#1033): layout 2 shown with its Purchase, the arrows going on past it to layout 3. */
export const SlotsGap: Story = { ...slots(HOME_VILLAGE.slotsGap) };
export const SlotsGapPhone320: Story = { ...PHONE_320, ...slots(HOME_VILLAGE.slotsGap) };
/** A locked layout tapped: unlock asked first, the price and the Cobbles held. */
export const SlotsBuy: Story = { ...slots(HOME_VILLAGE.slotsBuy) };
/** The purchase on its way: the carousel waits. */
export const SlotsBuying: Story = { ...slots(HOME_VILLAGE.slotsBuying) };
/** Layout 2 bought: open and empty, shown on the village as it was: Save keeps it there, the village unchanged. */
export const SlotsBought: Story = { ...slots(HOME_VILLAGE.slotsBought) };
/** Too few Cobbles for layout 3: its unlock asked, off, and why. */
export const SlotsShort: Story = { ...slots(HOME_VILLAGE.slotsShort) };
/** Load over changes kept nowhere: asked first. */
export const SlotsLoad: Story = { ...slots(HOME_VILLAGE.slotsLoad) };
/** Use: asked first, attackers will face it. */
export const SlotsActivate: Story = { ...slots(HOME_VILLAGE.slotsActivate) };
/** Layout 2 active: the village is its layout. */
export const SlotsActivated: Story = { ...slots(HOME_VILLAGE.slotsActivated) };
/** A saved layout that no longer fits (#804 open point 4), edited: it needs tiles first, never made active. */
export const SlotsNeedsTiles: Story = { ...slots(HOME_VILLAGE.slotsNeedsTiles) };
/** A slot write refused: what happened, above the carousel. */
export const SlotsRefused: Story = { ...slots(HOME_VILLAGE.slotsRefused) };

/**
 * The slots at work, as the mock ledger answers them: buy slot 2 (the Cobbles follow), press the die, Save here, Use (the
 * village changes), then slot 1 active again. Each write lands after 400 ms.
 */
function SlotsLive(args: HomeVillageSceneProps) {
  const [slots, setSlots] = useState<LayoutSlot[]>(() => LAYOUT_SLOTS.one.slots.map((s) => ({ ...s })));
  const [active, setActive] = useState(0);
  const [cobbles, setCobbles] = useState(LAYOUT_SLOTS.one.cobbles);
  const [busy, setBusy] = useState<{ kind: "save-to" | "activate" | "buy"; slot: number } | null>(null);
  const tiles = slots[active]!.tiles ?? LAYOUT_GROWING.tiles;
  const land = (kind: "save-to" | "activate" | "buy", slot: number, change: () => void) => {
    setBusy({ kind, slot });
    setTimeout(() => {
      change();
      setBusy(null);
    }, 400);
  };
  const put = (slot: number, change: Partial<LayoutSlot>) => setSlots((all) => all.map((s) => (s.slot === slot ? { ...s, ...change } : s)));
  return (
    <HomeVillageScene
      {...args}
      village={{ ...LAYOUT_GROWING, tiles, score: layoutScore(tiles) }}
      renderStage={(stage) => (
        <VillageStage
          {...stage}
          layoutSlots={{
        active,
        slots,
        cobbles,
        busy,
        onBuy: (slot, price) =>
          land("buy", slot, () => {
            setCobbles((c) => c - price);
            put(slot, { open: true });
          }),
        onSaveTo: (slot, draft) => land("save-to", slot, () => put(slot, { tiles: draft, score: layoutScore(draft) })),
            onActivate: (slot) => land("activate", slot, () => setActive(slot)),
          }}
        />
      )}
    />
  );
}

/** The slots at work at 375 px (#804's GIF): a random village saved into slot 2, made active, then slot 1 active again. */
export const SlotsLivePhone375: Story = { ...PHONE_375, args: HOME_VILLAGE.editing, render: (args) => <SlotsLive {...args} /> };
export const SlotsLiveWide1440: Story = { ...WIDE_1440, args: HOME_VILLAGE.editing, render: (args) => <SlotsLive {...args} /> };
