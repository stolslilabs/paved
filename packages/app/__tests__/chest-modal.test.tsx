import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChestModal, type ChestModalProps } from "../src/components/containers/chest-modal";
import { CHESTS } from "../src/mocks/village-v2";
import { PLAN } from "../src/mocks/village";

// The chest's opening (#784; CHESTS-PAGE, the book's reveal; END-CHEST: opened where it is won, a game's end or the home's prompt):
// the shake, the tap, the burst, the cards and the choice, Take, the tile kept and Claim; the sounds and the buzz of each beat.

const sfx = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../src/components/containers/audio-provider", () => ({ useSfx: () => sfx.play }));
const buzz = vi.hoisted(() => ({ haptic: vi.fn() }));
vi.mock("../src/lib/haptics", () => ({ haptic: buzz.haptic }));

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const played = () => sfx.play.mock.calls.map((c) => c[0] as string);
const EPIC = { chestId: 41, draw: { rank: "epic", plans: [PLAN.road, PLAN.wonder, PLAN.cityEdge] } } as const;
const RARE = { chestId: 40, draw: { rank: "rare", plans: [PLAN.roadCross, PLAN.stopRoads] } } as const;
const BASE: ChestModalProps = { open: true, onClose: () => {}, chest: null, more: 0, opened: null, opening: false, taken: null };
const show = (props: Partial<ChestModalProps>) => render(wrap(<ChestModal {...BASE} {...props} />));
afterEach(() => {
  cleanup();
  sfx.play.mockClear();
  buzz.haptic.mockClear();
});

describe("the chest's opening (#784, END-CHEST)", () => {
  it("shows the chest to open shaking, with its rattle and a light buzz; a tap opens it with a firm buzz", async () => {
    const onOpen = vi.fn();
    show({ chest: CHESTS[0]!, more: 2, onOpen });
    const modal = screen.getByRole("dialog", { name: "Epic chest" });
    expect(modal).toHaveAttribute("data-phase", "closed");
    expect(within(modal).getByText("Tap to open")).toBeInTheDocument();
    expect(within(modal).getByText(/more after it/)).toHaveTextContent("Keep one of its 3 tiles · 2 more after it");
    expect(played()).toEqual(["shake"]);
    expect(buzz.haptic).toHaveBeenCalledWith("light");
    await userEvent.click(within(modal).getByRole("button", { name: /^Open the epic chest: one of 3 tiles/ }));
    expect(onOpen).toHaveBeenCalledWith(41);
    expect(buzz.haptic).toHaveBeenLastCalledWith("firm");
  });

  it("shakes faster while the draw comes, and cannot be closed from the tap on", () => {
    show({ chest: CHESTS[0]!, opening: true });
    const modal = screen.getByRole("dialog", { name: "Epic chest" });
    expect(modal.querySelector('[data-shake="fast"]')).not.toBeNull();
    expect(screen.getByText("Opening…")).toBeInTheDocument();
    expect(modal).toHaveAttribute("data-locked");
    expect(within(modal).queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("bursts open with light and sound, flips each tile out with a light buzz, and keeps the one chosen with its own sound", async () => {
    const onTake = vi.fn();
    show({ opened: EPIC, onTake });
    // The book's reveal: "Choose 1 of 3" over the cards, no rank's word over it, the chest under them, Take.
    const modal = screen.getByRole("dialog", { name: "Choose 1 of 3" });
    expect(modal).toHaveAttribute("data-phase", "reveal");
    expect(within(modal).queryByText("Epic")).toBeNull();
    // The chest's light reaches over the cards and Take: it lets the taps through.
    expect(modal.querySelector('[data-burst="epic"]')).toHaveClass("pointer-events-none");
    expect(played()[0]).toBe("burst");
    expect(buzz.haptic).toHaveBeenCalledWith("firm");
    await vi.waitFor(() => expect(played().filter((n) => n === "flip")).toHaveLength(3));
    expect(buzz.haptic.mock.calls.filter(([kind]) => kind === "light")).toHaveLength(3);
    const cards = within(within(modal).getByRole("list", { name: "Chest tiles" })).getAllByRole("button");
    // Each card its name and its rarity, a word under the name, not the pill (the owner's trial); no count held.
    expect(cards[0]).toHaveAccessibleName("Long road, common");
    expect(cards[0]).toHaveTextContent(/^Long roadCommon$/);
    expect(modal.querySelector("[data-slot=rarity-badge]")).toBeNull();
    buzz.haptic.mockClear();
    await userEvent.click(cards[1]!);
    expect(buzz.haptic).toHaveBeenCalledWith("light");
    await userEvent.click(within(modal).getByRole("button", { name: /^Take / }));
    expect(buzz.haptic).toHaveBeenLastCalledWith("firm");
    expect(onTake).toHaveBeenCalledWith(41, 1);
    expect(played().at(-1)).toBe("keep");
  });

  it("chooses the first card from the start and always one: a tap on the chosen keeps it, another moves the choice", async () => {
    const onTake = vi.fn();
    show({ opened: EPIC, onTake });
    const tiles = within(screen.getByRole("list", { name: "Chest tiles" })).getAllByRole("button");
    const pressed = () => tiles.map((t) => t.getAttribute("aria-pressed"));
    expect(pressed()).toEqual(["true", "false", "false"]);
    expect(screen.getByRole("button", { name: /^Take / })).toBeEnabled();
    await userEvent.click(tiles[0]!);
    expect(pressed()).toEqual(["true", "false", "false"]);
    await userEvent.click(tiles[1]!);
    expect(pressed()).toEqual(["false", "true", "false"]);
    await userEvent.click(screen.getByRole("button", { name: /^Take Grove shrine$/ }));
    expect(onTake).toHaveBeenCalledWith(41, 1);
  });

  it("gives a basic chest's one tile as it is, and says no Cobbles (a chest holds none)", async () => {
    const onTake = vi.fn();
    show({ opened: { chestId: 39, draw: { rank: "basic", plans: [PLAN.forestCity] } }, onTake });
    const modal = screen.getByRole("dialog", { name: "Your new tile" });
    expect(within(modal).queryByText(/Cobbles/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Take City corner$/ }));
    expect(onTake).toHaveBeenCalledWith(39, 0);
  });

  it("cannot be closed through the reveal: no cross, Escape and a tap outside keep it", async () => {
    const onClose = vi.fn();
    show({ opened: RARE, onClose });
    const modal = screen.getByRole("dialog", { name: "Choose 1 of 2" });
    expect(within(modal).queryByRole("button", { name: "Close" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(document.querySelector<HTMLElement>("[data-slot=dialog-overlay]")!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Choose 1 of 2" })).toHaveAttribute("data-phase", "reveal");
  });

  it("says the tile kept on its gold card with one answer, Claim, and the reward's buzz (the owner's ask of 2026-11-06)", async () => {
    const onClose = vi.fn();
    show({ taken: { plan: PLAN.wonder }, more: 2, onClose });
    const kept = screen.getByRole("dialog", { name: "Added to your inventory" });
    expect(within(kept).getAllByRole("button").map((b) => b.textContent)).toEqual(["Claim"]);
    expect(buzz.haptic).toHaveBeenCalledWith("reward");
    await userEvent.click(within(kept).getByRole("button", { name: "Claim" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("says a refusal in the reveal", () => {
    show({ opened: RARE, refusal: "This chest was opened already. Nothing was taken." });
    expect(within(screen.getByRole("dialog", { name: "Choose 1 of 2" })).getByText("This chest was opened already. Nothing was taken.")).toBeInTheDocument();
  });

  it("under reduced motion: no shake, no flight, the sounds kept", () => {
    const { unmount } = render(<MotionConfig reducedMotion="always">{wrap(<ChestModal {...BASE} chest={CHESTS[0]!} />)}</MotionConfig>);
    expect(screen.getByRole("dialog", { name: "Epic chest" }).querySelector("[data-shake]")).toBeNull();
    expect(played()).toEqual(["shake"]);
    unmount();
    render(<MotionConfig reducedMotion="always">{wrap(<ChestModal {...BASE} opened={EPIC} />)}</MotionConfig>);
    expect(played()).toContain("burst");
  });
});
