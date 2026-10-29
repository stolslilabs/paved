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
 * The chests (#739, part of #732; livelier since #759; #784) on fakes: the day's three slots and their reset, a ready chest's
 * opening in the modal on arrival, frame by frame (shaking, its draw on its way, its tiles, the tile kept), and the page with
 * the modal closed, whose slots say their state. One story per state of `VILLAGE_CHESTS` (`mocks/village-v2.ts`); `Interactive` opens them one after the
 * other on a ticking clock, and `ResetLive` ticks through the countdown's last minute to the reset.
 */
const meta = {
  title: "Scenes/Village v2/Chests",
  component: VillageChestsScene,
  // The opening's sounds (#784), after a first tap in the canvas.
  parameters: { layout: "fullscreen", sfx: 0.8 },
  args: { ...VILLAGE_CHESTS.waiting, tileArt: originalTileArt(SOURCE_ASSETS), onBack: fn(), onNavigate: fn(), onPlay: fn(), onOpen: fn(), onTake: fn(), onDismissRefusal: fn(), onEditLayout: fn() },
} satisfies Meta<typeof VillageChestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Arrival with 3 chests ready (#784): the modal opens, the epic chest shakes at its centre, "Tap to open". */
export const Waiting: Story = { args: VILLAGE_CHESTS.waiting };
/** The tap: its draw on its way (the VRF), the chest shakes on. */
export const Opening: Story = { args: VILLAGE_CHESTS.opening };
/** The lid burst with light in the epic's colour: keep one of 3 tiles, each with its rarity and how many are held. */
export const Epic: Story = { args: VILLAGE_CHESTS.epic };
/** A tile chosen in the epic chest: Keep. */
export const EpicChosen: Story = { args: VILLAGE_CHESTS.epicChosen };
/** A rare chest: one of 2. */
export const Rare: Story = { args: VILLAGE_CHESTS.rare };
/** A basic chest: one tile, no choice. */
export const Basic: Story = { args: VILLAGE_CHESTS.basic };
/** A chest that held Cobbles besides its tiles. */
export const CobblesWon: Story = { args: VILLAGE_CHESTS.cobbles };
/** The choice on its way. */
export const Taking: Story = { args: VILLAGE_CHESTS.taking };
/** The tile kept, in the inventory (and the Cobbles), two chests still waiting: Next chest, or Later. */
export const Taken: Story = { args: VILLAGE_CHESTS.taken };
/** The last chest's tile kept: Done, Edit layout. */
export const TakenLast: Story = { args: VILLAGE_CHESTS.takenLast };
/** A Story chest (no slot), in the same modal after the PvP ones. */
export const StoryChest: Story = { args: VILLAGE_CHESTS.story };
/** The chain refused: what happened, in the modal, until dismissed. */
export const Refused: Story = { args: VILLAGE_CHESTS.refused };
/** The page, the modal closed: slot 1 opened (a grey, disabled chest), slot 2 won (rare, a tap opens it), slot 3 free. */
export const Slots: Story = { args: VILLAGE_CHESTS.slots };
/** The rare chest drawn, the modal closed before its choice: the slots wait, "keep one of its tiles before the next chest". */
export const OpenPending: Story = { args: VILLAGE_CHESTS.openPending };
/** The modal closed with 3 chests ready: the won slots in their ranks' colours, "Open your chests". */
export const Closed: Story = { args: VILLAGE_CHESTS.closed };
/** The page after the last choice: the tile kept, Edit layout. */
export const Kept: Story = { args: VILLAGE_CHESTS.kept };
/** The day's 3 slots free: their outlines alone; a Story chest waits. */
export const Free: Story = { args: VILLAGE_CHESTS.free };
/** Two slots won, the read giving no ranks: each won slot shows a chest of no rank. */
export const NoRanks: Story = { args: VILLAGE_CHESTS.noRanks };
/** Today's 3 slots won and opened: the countdown takes the hero's centre, the slots grey under it. */
export const Capped: Story = { args: VILLAGE_CHESTS.capped };
/** The countdown's last minute: it pulses (still under reduced motion). */
export const LastMinute: Story = { args: VILLAGE_CHESTS.lastMinute };
/** The reset reached: "Ready", the slots light up again. */
export const Ready: Story = { args: VILLAGE_CHESTS.ready };
/** No chest waiting: win stars to fill a slot, a button to the mode choice. */
export const Empty: Story = { args: VILLAGE_CHESTS.empty };
export const Loading: Story = { args: VILLAGE_CHESTS.loading };
export const Guest: Story = { args: VILLAGE_CHESTS.guest };
/** Arrival under reduced motion: nothing shakes or flies, a short fade; the sounds as the settings say. */
export const WaitingReduced: Story = { args: VILLAGE_CHESTS.waiting, parameters: { reducedMotion: "always" } };

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

/** The fakes played: arrive, open each chest in the modal (the draw takes a moment), keep a tile; the epic one holds Cobbles. */
function Playground(props: VillageChestsSceneProps) {
  const clock = useTicking(props.now ?? TOMORROW - 3600, props.resetsAt ?? TOMORROW);
  const [chests, setChests] = useState(CHESTS);
  const [pvpOpened, setPvpOpened] = useState<number[]>([]);
  const [opening, setOpening] = useState<number | null>(null);
  const [opened, setOpened] = useState<{ chestId: number; draw: ChestDraw } | null>(null);
  const [taken, setTaken] = useState<ChestTaken | null>(null);
  const open = (id: number) => {
    const chest = chests.find((c) => c.id === id)!;
    setTaken(null);
    setOpening(id);
    setTimeout(() => {
      setOpening(null);
      setOpened({ chestId: id, draw: { rank: chest.rank, plans: DRAWS.slice(0, CHEST_CHOICES[chest.rank]), cobbles: chest.rank === "epic" ? 50 : null } });
    }, 700);
  };
  const take = (id: number, index: number) => {
    if (!opened) return;
    setTaken({ plan: opened.draw.plans[index]!, cobbles: opened.draw.cobbles });
    setOpened(null);
    const slot = chests.find((c) => c.id === id)?.slot;
    if (slot != null) setPvpOpened((s) => [...s, slot]);
    setChests((c) => c.filter((x) => x.id !== id));
  };
  return (
    <VillageChestsScene
      {...props}
      now={clock.now}
      resetsAt={clock.resetsAt}
      ready={clock.ready}
      chests={chests}
      pvpToday={2}
      pvpOpened={pvpOpened}
      opening={opening}
      opened={opened}
      taken={taken}
      onOpen={open}
      onTake={take}
    />
  );
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
    />
  );
}

export const ResetLive: Story = { args: VILLAGE_CHESTS.capped, render: (args) => <ResetPlayground {...args} /> };

/** In the phone's bar (#763): the Chests current at 375 px; from 1440 px in the home's side panel, laid out as on a phone (#762). */
export const WaitingPhone: Story = { ...Waiting, ...PHONE_375 };
export const WaitingWide: Story = { ...Waiting, ...WIDE_1440, decorators: [inPanel("Chests")] };
/** The opening played at 375 and 1440 px: arrive, tap, the burst, the tiles, the choice, the next chest. */
export const InteractivePhone: Story = { ...Interactive, ...PHONE_375 };
export const InteractiveWide: Story = { ...Interactive, ...WIDE_1440, decorators: [inPanel("Chests")] };
export const SlotsPhone: Story = { ...Slots, ...PHONE_375 };
/** PAGES-SCROLL (#782): at 375 px, the page with its modal closed (a tile kept) scrolled in its region to its end, the header sticky above it. */
export const KeptPhoneScrolled: Story = { ...Kept, ...PHONE_375, play: scrolledToEnd };
/** PAGES-SCROLL (#782): at 1440 px the panel's body scrolled to the page's end; no close button (a click outside or Escape). */
export const KeptWideScrolled: Story = { ...Kept, ...WIDE_1440, decorators: [inPanel("Chests")], play: scrolledToEnd };
