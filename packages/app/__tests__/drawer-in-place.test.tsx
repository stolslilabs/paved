import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DrawerOrderContext, HudDrawer } from "../src/components/containers/hud-drawer";
import { shownView } from "./route-helpers";

// DRAWER-NAV-IN-PLACE (#1064): a page opened from a drawer (`HudDrawer`'s `inPlace`) is drawn in its place: its title and its end on
// the drawer's header, its Back the header's, the pages it covers kept mounted under it in the chain's order.

const wrap = (ui: ReactNode) => (
  <LazyMotion features={domMax} strict>
    <MotionConfig reducedMotion="always">{ui}</MotionConfig>
  </LazyMotion>
);

/** A page's body that keeps a count of its own: a remount would start it again. */
function Counter({ name }: { name: string }) {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      {name} {n}
    </button>
  );
}

describe("a page in a drawer's place (DRAWER-NAV-IN-PLACE)", () => {
  it("draws its title and its end on the drawer's header, and the drawer's own again once it leaves", async () => {
    const back = vi.fn();
    const { rerender } = render(
      wrap(
        <HudDrawer open onOpenChange={() => {}} title="Chat" end={<span>Chat end</span>} side="right">
          <p>The chat</p>
          <HudDrawer open onOpenChange={back} title="Profile" end={<span>120 Cobbles</span>} inPlace>
            <p>Rename</p>
          </HudDrawer>
        </HudDrawer>,
      ),
    );
    const drawer = screen.getByRole("dialog", { name: "Profile" });
    const header = drawer.querySelector<HTMLElement>("[data-slot=hud-drawer-title]")!.parentElement!;
    // The page's end (the rename's Cobbles), not the drawer's.
    expect(within(header).getByText("120 Cobbles")).toBeInTheDocument();
    expect(within(header).queryByText("Chat end")).toBeNull();
    await userEvent.click(within(header).getByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalledWith(false);
    rerender(
      wrap(
        <HudDrawer open onOpenChange={() => {}} title="Chat" end={<span>Chat end</span>} side="right">
          <p>The chat</p>
          <HudDrawer open={false} onOpenChange={back} title="Profile" end={<span>120 Cobbles</span>} inPlace>
            <p>Rename</p>
          </HudDrawer>
        </HudDrawer>,
      ),
    );
    expect(screen.getByRole("dialog", { name: "Chat" })).toBe(drawer);
    expect(within(header).getByText("Chat end")).toBeInTheDocument();
    expect(within(header).queryByText("120 Cobbles")).toBeNull();
  });

  it("stacks a chain's pages in its order whichever mounts first, the covered ones kept as they were", async () => {
    function Chain({ pages }: { pages: string[] }) {
      return (
        <HudDrawer open onOpenChange={() => {}} title="Ranking" side="right">
          <p>The ranking</p>
          {/* Mounted in reverse: the later page first, as a lazy chunk may come before the earlier one's. */}
          {[...pages.keys()].reverse().map((i) => (
            <DrawerOrderContext.Provider key={pages[i]} value={i}>
              <HudDrawer open onOpenChange={() => {}} title={pages[i]!} slot={pages[i]} inPlace>
                <Counter name={pages[i]!} />
              </HudDrawer>
            </DrawerOrderContext.Provider>
          ))}
        </HudDrawer>
      );
    }
    const { rerender } = render(wrap(<Chain pages={["guild"]} />));
    const guild = shownView("guild")!;
    await userEvent.click(within(guild).getByRole("button", { name: "guild 0" }));
    rerender(wrap(<Chain pages={["guild", "member"]} />));
    // The member on top, the guild under it, inert, as it was.
    expect(screen.getByRole("dialog", { name: "member" })).toBeInTheDocument();
    expect(shownView()).toBe(shownView("member"));
    expect(guild).toHaveAttribute("inert");
    // Back: the same guild, its count kept (not mounted again).
    rerender(wrap(<Chain pages={["guild"]} />));
    expect(shownView()).toBe(guild);
    expect(within(guild).getByRole("button", { name: "guild 1" })).toBeInTheDocument();
    await act(async () => {});
  });
});
