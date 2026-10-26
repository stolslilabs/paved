import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VillageChestsScene } from "../src/components/scenes/village-chests-scene";
import { CHESTS, VILLAGE_CHESTS } from "../src/mocks/village-v2";
import { chestSlots } from "../src/routes/chest-slots";

// The chest's opening in a modal (#784): on arrival, the shake, the burst, the tiles, the choice and the next chest; the slots'
// three states; the sounds and the buzz of each beat.

const sfx = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../src/components/containers/audio-provider", () => ({ useSfx: () => sfx.play }));
const buzz = vi.hoisted(() => ({ haptic: vi.fn() }));
vi.mock("../src/lib/haptics", () => ({ haptic: buzz.haptic }));

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const played = () => sfx.play.mock.calls.map((c) => c[0] as string);
afterEach(() => {
  cleanup();
  sfx.play.mockClear();
  buzz.haptic.mockClear();
});

describe("the chest modal (#784)", () => {
  it("opens on arrival with a ready chest, shaking, with its rattle and a light buzz", () => {
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} />));
    const modal = screen.getByRole("dialog", { name: "Gold chest" });
    expect(modal).toHaveAttribute("data-phase", "closed");
    expect(within(modal).getByText("PvP · 3 stars against Rook of Ashford")).toBeInTheDocument();
    expect(modal.querySelector("[data-shake]")).not.toBeNull();
    expect(within(modal).getByText(/more after it/)).toHaveTextContent("Keep one of its 3 tiles · 2 more after it");
    expect(played()).toEqual(["shake"]);
    expect(buzz.haptic).toHaveBeenCalledWith("light");
  });

  it("bursts open with light and sound, flips each tile out, and keeps the one chosen with its own sound", async () => {
    const onTake = vi.fn();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.gold} onTake={onTake} />));
    const modal = screen.getByRole("dialog", { name: "Gold chest" });
    expect(modal).toHaveAttribute("data-phase", "reveal");
    expect(modal.querySelector('[data-burst="gold"]')).not.toBeNull();
    expect(played()[0]).toBe("burst");
    expect(buzz.haptic).toHaveBeenCalledWith("firm");
    await waitFor(() => expect(played().filter((n) => n === "flip")).toHaveLength(3));
    await userEvent.click(within(modal).getAllByRole("button", { name: /held$/ })[1]!);
    await userEvent.click(within(modal).getByRole("button", { name: /^Keep / }));
    expect(onTake).toHaveBeenCalledWith(41, 1);
    expect(played().at(-1)).toBe("keep");
  });

  it("after the choice, brings the next chest in the same modal, then closes on Done", async () => {
    const { rerender } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.taken} />));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Added to your inventory" })).getByRole("button", { name: /Next chest/ }));
    expect(screen.getByRole("dialog", { name: "Silver chest" })).toHaveAttribute("data-phase", "closed");
    // The last one's tile kept: Done closes it on the page.
    rerender(wrap(<VillageChestsScene {...VILLAGE_CHESTS.takenLast} />));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Added to your inventory" })).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Added to your inventory")).toBeInTheDocument();
  });

  it("stays closed for the visit once closed; a won slot or Open your chests brings it back", async () => {
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} />));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Open the silver chest of slot 2" }));
    // The chests that need not open in order: the slot tapped is the one at the centre.
    expect(await screen.findByRole("dialog", { name: "Silver chest" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: /Open your chests/ }));
    expect(await screen.findByRole("dialog", { name: "Gold chest" })).toBeInTheDocument();
  });

  it("shows the first waiting when the chests open in order, and the PvP chests before the Story ones otherwise", () => {
    const story = CHESTS[2]!;
    const { unmount } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} chests={[story, ...CHESTS.slice(0, 2)]} />));
    expect(screen.getByRole("dialog", { name: "Gold chest" })).toBeInTheDocument();
    unmount();
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} chests={[story, ...CHESTS.slice(0, 2)]} inOrder />));
    expect(screen.getByRole("dialog", { name: "Bronze chest" })).toBeInTheDocument();
    expect(screen.getByText("Story · The Old Road, level 2")).toBeInTheDocument();
  });

  it("asks the draw on a tap and shakes on while it comes", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} onOpen={onOpen} />));
    await userEvent.click(screen.getByRole("button", { name: /^Open the gold chest/ }));
    expect(onOpen).toHaveBeenCalledWith(41);
    rerender(wrap(<VillageChestsScene {...VILLAGE_CHESTS.opening} onOpen={onOpen} />));
    expect(screen.getByRole("button", { name: /^Open the gold chest/ })).toBeDisabled();
    expect(screen.getByRole("dialog").querySelector('[data-shake="fast"]')).not.toBeNull();
    expect(screen.getByText("Opening…")).toBeInTheDocument();
  });

  it("says a refusal in the modal while it is open", () => {
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.refused} />));
    expect(within(screen.getByRole("dialog")).getByText("This chest was opened already. Nothing was taken.")).toBeInTheDocument();
  });

  it("under reduced motion: no shake, no flight, the sounds kept", () => {
    const { unmount } = render(<MotionConfig reducedMotion="always">{wrap(<VillageChestsScene {...VILLAGE_CHESTS.waiting} />)}</MotionConfig>);
    expect(screen.getByRole("dialog").querySelector("[data-shake]")).toBeNull();
    expect(played()).toEqual(["shake"]);
    unmount();
    render(<MotionConfig reducedMotion="always">{wrap(<VillageChestsScene {...VILLAGE_CHESTS.gold} />)}</MotionConfig>);
    expect(played()).toContain("burst");
  });
});

describe("the slots' three states (#784)", () => {
  const slots = () => within(screen.getByRole("list", { name: "Today's PvP slots" })).getAllByRole("listitem");

  it("says free (its outline), won (its chest in its rank's colour, to open) and opened (grey, disabled)", () => {
    render(wrap(<VillageChestsScene {...VILLAGE_CHESTS.slots} />));
    expect(slots().map((li) => li.getAttribute("aria-label"))).toEqual(["Slot 1: opened", "Slot 2: won, silver chest", "Slot 3: free"]);
    expect(slots().map((li) => li.dataset.slotState)).toEqual(["opened", "won", "free"]);
    const [opened, won, free] = slots();
    expect(within(opened!).queryByRole("button")).toBeNull();
    expect(opened!.querySelector("[data-spent]")).not.toBeNull();
    expect(within(won!).getByRole("button", { name: "Open the silver chest of slot 2" })).toBeInTheDocument();
    expect(within(won!).getByRole("img", { name: "Silver chest" })).toHaveAttribute("data-rank", "silver");
    expect(free!.querySelector("[data-icon], i, svg")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Waiting/ })).toBeNull();
  });
});

describe("chestSlots (#784)", () => {
  const DAY = 20_000;
  const pvp = (slot?: number) => ({ source: "pvp" as const, day: DAY, ...(slot === undefined ? {} : { slot }) });
  const story = { source: "story" as const };
  const view = (pending: ("bronze" | "silver" | "gold")[], origins: (ReturnType<typeof pvp> | typeof story | null)[] | undefined, pvpToday: number) => ({
    pending,
    ...(origins ? { origins } : {}),
    open: null,
    openOrigin: null,
    pvpToday,
    pvpCap: 3,
  });

  it("puts today's PvP chests in the slots they fill, a Story chest in none, and calls the others opened", () => {
    expect(chestSlots(view(["silver", "bronze", "gold"], [pvp(1), story, { source: "pvp", day: DAY - 1, slot: 0 }], 2), DAY)).toEqual({
      opened: [0],
      chests: [
        { id: 1, rank: "silver", source: "pvp", slot: 1 },
        { id: 2, rank: "bronze", source: "story" },
        { id: 3, rank: "gold", source: "pvp" },
      ],
    });
  });

  it("keeps each slot its own when the chests are opened out of order", () => {
    // Slot 2 (silver) opened first: slot 1's gold still waits, and only slot 2 is grey.
    expect(chestSlots(view(["gold"], [pvp(0)], 2), DAY)).toEqual({ opened: [1], chests: [{ id: 1, rank: "gold", source: "pvp", slot: 0 }] });
  });

  it("counts the open chest as not opened yet", () => {
    const open = { rank: "gold" as const, plans: [1, 2, 3], cobbles: 0 };
    expect(chestSlots({ ...view(["silver"], [pvp(2)], 3), open, openOrigin: pvp(1) }, DAY)).toEqual({ opened: [0], chests: [{ id: 1, rank: "silver", source: "pvp", slot: 2 }] });
  });

  it("never shows a chest waiting as opened when a save from before the origins cannot place it", () => {
    // Two PvP chests won today in an older save: no origins at all, or null ones.
    expect(chestSlots(view(["silver", "gold"], [null, null], 2), DAY)).toEqual({ opened: [], chests: [{ id: 1, rank: "silver" }, { id: 2, rank: "gold" }] });
    expect(chestSlots(view(["silver", "gold"], undefined, 2), DAY).opened).toEqual([]);
    // One placed, one not: any slot may be the unplaced one's.
    expect(chestSlots(view(["silver", "gold"], [pvp(1), null], 2), DAY).opened).toEqual([]);
    expect(chestSlots(view(["silver"], [pvp()], 2), DAY).opened).toEqual([]);
  });
});
