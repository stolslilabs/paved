import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { DAY } from "../../mocks/clock";
import { PLAN } from "../../mocks/village";
import { CHESTS, TOMORROW, VILLAGE_CHESTS } from "../../mocks/village-v2";
import { CHEST_CHOICES } from "../elements/chest-badge";
import type { ChestDraw } from "../containers/chest-reveal";
import { READY_S } from "../containers/chest-slots";
import { VillageChestsScene, type ChestTaken, type VillageChestsSceneProps } from "./village-chests-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";
import { inPanel } from "../../stories/in-panel";
import { scrolledToEnd } from "../../stories/scrolled-to-end";

/**
 * The chests (#739, part of #732; livelier since #759) on fakes: the day's three slots and their reset, the chests waiting by
 * rank, a chest opened. One story per state of `VILLAGE_CHESTS` (`mocks/village-v2.ts`); `Interactive` opens them one after the
 * other on a ticking clock, and `ResetLive` ticks through the countdown's last minute to the reset. The hero's two directions:
 * `Scenes/Village v2/Chests directions`.
 */
const meta = {
  title: "Scenes/Village v2/Chests",
  component: VillageChestsScene,
  parameters: { layout: "fullscreen" },
  args: { ...VILLAGE_CHESTS.waiting, tileArt: originalTileArt(SOURCE_ASSETS), onBack: fn(), onNavigate: fn(), onPlay: fn(), onOpen: fn(), onTake: fn(), onDismissRefusal: fn(), onEditLayout: fn() },
} satisfies Meta<typeof VillageChestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three chests waiting (gold, silver, bronze); 2 of today's 3 slots won (gold, silver), 1 free; the reset ticks under them. */
export const Waiting: Story = { args: VILLAGE_CHESTS.waiting };
/** The day's 3 slots free: empty pedestals waiting for a win; a Story chest waits. */
export const Free: Story = { args: VILLAGE_CHESTS.free };
/** Two slots won, the read giving no ranks (the mock ledger's today): each won slot shows a chest of no rank. */
export const NoRanks: Story = { args: VILLAGE_CHESTS.noRanks };
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
/** Today's 3 slots are won: the countdown takes the hero's centre, the slots under it. */
export const Capped: Story = { args: VILLAGE_CHESTS.capped };
/** The countdown's last minute: it pulses (still under reduced motion). */
export const LastMinute: Story = { args: VILLAGE_CHESTS.lastMinute };
/** The reset reached: "Ready", the slots light up again. */
export const Ready: Story = { args: VILLAGE_CHESTS.ready };
/** No chest waiting: win stars to fill a slot, a button to the mode choice. */
export const Empty: Story = { args: VILLAGE_CHESTS.empty };
/** The chain refused: what happened, until dismissed. */
export const Refused: Story = { args: VILLAGE_CHESTS.refused };
export const Loading: Story = { args: VILLAGE_CHESTS.loading };
export const Guest: Story = { args: VILLAGE_CHESTS.guest };

const DRAWS = [PLAN.wonder, PLAN.road, PLAN.cityEdge, PLAN.stopRoads, PLAN.roadCross, PLAN.city];

/** A clock that ticks each second from `start`; at `resetsAt` the slots say "Ready" for `READY_S`, then the next day counts. */
function useTicking(start: number, resetsAt: number) {
  const [now, setNow] = useState(start);
  useEffect(() => {
    const timer = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const reset = now >= resetsAt;
  return { now, ready: reset && now < resetsAt + READY_S, resetsAt: reset ? resetsAt + DAY : resetsAt, reset };
}

/** The fakes played: open each chest, keep a tile; the gold one holds Cobbles. The countdown ticks. */
function Playground(props: VillageChestsSceneProps) {
  const clock = useTicking(props.now ?? TOMORROW - 3600, props.resetsAt ?? TOMORROW);
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
  return <VillageChestsScene {...props} now={clock.now} resetsAt={clock.resetsAt} ready={clock.ready} chests={chests} opened={opened} taken={taken} onOpen={open} onTake={take} />;
}

export const Interactive: Story = { render: (args) => <Playground {...args} /> };

/** The three slots won, 65 s before the reset: the last minute pulses, then "Ready" lights the slots and the next day counts. */
function ResetPlayground(props: VillageChestsSceneProps) {
  const clock = useTicking(TOMORROW - 65, TOMORROW);
  return (
    <VillageChestsScene
      {...props}
      now={clock.now}
      resetsAt={clock.resetsAt}
      ready={clock.ready}
      pvpToday={clock.reset ? 0 : 3}
      pvpRanks={clock.reset ? undefined : ["gold", "silver", "bronze"]}
    />
  );
}

export const ResetLive: Story = { args: VILLAGE_CHESTS.capped, render: (args) => <ResetPlayground {...args} /> };

/** In the phone's bar (#763): the Chests current at 375 px; from 1440 px in the home's side panel, laid out as on a phone (#762). */
export const WaitingPhone: Story = { ...Waiting, ...PHONE_375 };
export const WaitingWide: Story = { ...Waiting, ...WIDE_1440, decorators: [inPanel("Chests")] };
/** PAGES-SCROLL (#782): at 375 px the page scrolls in its region to its last chest, the header sticky above it. */
export const WaitingPhoneScrolled: Story = { ...WaitingPhone, play: scrolledToEnd };
/** PAGES-SCROLL (#782): at 1440 px the panel's body scrolls to the last chest; no close button (a click outside or Escape). */
export const WaitingWideScrolled: Story = { ...WaitingWide, play: scrolledToEnd };
