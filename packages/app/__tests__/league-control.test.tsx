import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeagueControl } from "../src/components/containers/league-control";
import { lastAttack } from "../src/data/pvp-standing";
import { DataProvider, type DataSources } from "../src/data/sources";
import { mockImplementation } from "./mock-fakes";
import { LEAGUES, leagueOf } from "../src/lib/pvp-rules";

const wrap = (ui: ReactNode, reduced: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced}>{ui}</MotionConfig>
  </LazyMotion>
);
const control = (crowns: number, onLeague = vi.fn(), reduced: "never" | "always" = "never") => wrap(<LeagueControl crowns={crowns} onLeague={onLeague} />, reduced);
const crest = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-slot=league-crest-icon]")!;
/** The League page's plate (`variant="page"`), which keeps the crest. */
const page = (crowns: number, unranked?: boolean) => wrap(<LeagueControl crowns={crowns} unranked={unranked} variant="page" />);

describe("LeagueControl (#829)", () => {
  it("one button named by the league and the crowns; the crowns shown, no league name", () => {
    render(control(1_240));
    const button = screen.getByRole("button", { name: `League: ${leagueOf(1_240).name}, 1,240 crowns` });
    expect(button).toHaveTextContent(/^1,240$/);
    expect(button).not.toHaveTextContent(leagueOf(1_240).name);
    expect(button.querySelector("[data-icon=trophy]")).toBeNull();
    expect(button.querySelector("[data-slot=ui-icon][data-icon=crown]")).not.toBeNull();
  });

  it("the home's capsule (HOME-UI-CAPSULES): the HUD's frame, the gold crown capping its left end; the crest is the player card's", () => {
    const { container } = render(control(1_240));
    const plate = container.querySelector<HTMLElement>("[data-side=left]")!;
    expect(plate.dataset.frame).toBe("hud");
    expect(plate.querySelector("[data-slot=hud-frame]")).not.toBeNull();
    // The crown is the end (drawn first, the plate reversed), no crest.
    expect(plate.lastElementChild!.querySelector("[data-slot=ui-icon][data-icon=crown]")).not.toBeNull();
    expect(container.querySelector("[data-slot=league-crest-icon]")).toBeNull();
  });

  it("the page's crest is its tier's icon form (#917), the division as its numeral; one crown named singular", () => {
    const { container, rerender } = render(page(0));
    expect(crest(container)).toHaveAttribute("data-tier", "wood");
    expect(crest(container)).not.toHaveAttribute("data-division");
    rerender(page(1_240));
    expect(crest(container)).toHaveAttribute("data-tier", leagueOf(1_240).id);
    rerender(page(2_800));
    // Emerald II: its numeral.
    expect(crest(container)).toHaveAttribute("data-tier", "emerald");
    expect(crest(container)).toHaveAttribute("data-division", "II");
    rerender(page(5_320));
    expect(crest(container)).toHaveAttribute("data-tier", "grandmaster");
    expect(crest(container)).not.toHaveAttribute("data-division");
    rerender(control(1));
    expect(screen.getByRole("button", { name: `League: ${leagueOf(1).name}, 1 crown` })).toBeInTheDocument();
  });

  it("the home's read: Unranked with no crowns and no attack, Wood after an attack, Wood when not read", () => {
    const { rerender } = render(wrap(<LeagueControl crowns={0} attacks={0} />));
    expect(screen.getByRole("button", { name: "League: Unranked, 0 crowns" })).toHaveAttribute("data-tier", "unranked");
    rerender(wrap(<LeagueControl crowns={0} attacks={2} />));
    expect(screen.getByRole("button", { name: "League: Wood, 0 crowns" })).toHaveAttribute("data-tier", "wood");
    rerender(wrap(<LeagueControl />));
    expect(screen.getByRole("button", { name: "League: Wood, 0 crowns" })).toHaveAttribute("data-tier", "wood");
  });

  it("the home's read on the mock ledger: Unranked before any attack, Wood once a first v2 attack is open (#917)", async () => {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    const writes = s.ledger.writesFor(me);
    await writes.foundFreeVillage();
    const control = (sources: DataSources) =>
      wrap(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <DataProvider sources={sources}>
            <LeagueControl crowns={0} attacks={0} />
          </DataProvider>
        </QueryClientProvider>,
      );
    const { unmount } = render(control(s.sources));
    await waitFor(() => expect(screen.getByRole("button", { name: "League: Unranked, 0 crowns" })).toHaveAttribute("data-tier", "unranked"));
    unmount();
    // The first attack open: no crowns and none settled, yet in the leagues (as the League page says).
    await writes.drawOpponentV2("search");
    await writes.startAttackV2();
    expect(await s.ledger.pvpLeague(me)).toMatchObject({ crowns: 0, attacks: 0 });
    render(control(s.sources));
    expect(await screen.findByRole("button", { name: "League: Wood, 0 crowns" })).toHaveAttribute("data-tier", "wood");
  });

  it("an attack in PvP v1's store counts too", async () => {
    const sources = { views: { pvpAttack: async () => ({ id: 3 }) }, signer: { address: "0x0abc" } } as unknown as DataSources;
    render(
      wrap(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <DataProvider sources={sources}>
            <LeagueControl crowns={0} attacks={0} />
          </DataProvider>
        </QueryClientProvider>,
      ),
    );
    expect(await screen.findByRole("button", { name: "League: Wood, 0 crowns" })).toHaveAttribute("data-tier", "wood");
  });

  it("lastAttack: v1's id, else v2's, 0 for none; null where neither is served, undefined while read", () => {
    expect(lastAttack({ id: 0 }, { attack: null })).toEqual({ id: 0 });
    expect(lastAttack({ id: 0 }, { attack: { id: 1 } as never })).toEqual({ id: 1 });
    expect(lastAttack({ id: 2 }, null)).toEqual({ id: 2 });
    expect(lastAttack(null, { attack: { id: 1 } as never })).toEqual({ id: 1 });
    expect(lastAttack(null, null)).toBeNull();
    expect(lastAttack(undefined, null)).toBeUndefined();
    expect(lastAttack({ id: 0 }, undefined)).toBeUndefined();
  });

  it("Unranked (no crowns, no attack): named so; on the page, Unranked's crest", () => {
    const { unmount } = render(wrap(<LeagueControl crowns={0} unranked />));
    expect(screen.getByRole("button", { name: "League: Unranked, 0 crowns" })).toHaveAttribute("data-tier", "unranked");
    unmount();
    const { container } = render(page(0, true));
    expect(crest(container)).toHaveAttribute("data-tier", "unranked");
    expect(crest(container)).not.toHaveAttribute("data-division");
  });

  it("the League page's (#859): the chain's league over the count's, no trophy, its own name", () => {
    render(wrap(<LeagueControl crowns={380} league={LEAGUES[1]!} variant="page" label="Your league: Iron III, 380 crowns. Show it" />));
    const button = screen.getByRole("button", { name: "Your league: Iron III, 380 crowns. Show it" });
    expect(button).toHaveAttribute("data-league", "iron");
    // The crowns and the crest alone: no trophy, the page needs no way to itself.
    expect(button.querySelector("[data-icon=trophy]")).toBeNull();
    expect(crest(button)).toHaveAttribute("data-tier", "iron");
    expect(crest(button)).toHaveAttribute("data-division", "III");
  });

  it("a tap anywhere opens the League page", async () => {
    const onLeague = vi.fn();
    const { container } = render(control(1_240, onLeague));
    await userEvent.click(container.querySelector<HTMLElement>("[data-slot=ui-icon][data-icon=crown]")!);
    await userEvent.click(screen.getByText("1,240"));
    expect(onLeague).toHaveBeenCalledTimes(2);
  });

  it("a promotion pulses a ring round the crown; none under reduced motion, nor on a drop", async () => {
    const { container, rerender } = render(control(1_240));
    expect(container.querySelector("[data-slot=league-promotion]")).toBeNull();
    rerender(control(1_000));
    await act(async () => {});
    expect(container.querySelector("[data-slot=league-promotion]")).toBeNull();
    rerender(control(1_400));
    await waitFor(() => expect(container.querySelector("[data-slot=league-promotion]")).not.toBeNull());
    // Gold I to Emerald III (#917): the ring in Emerald's green.
    rerender(control(2_600));
    await waitFor(() => expect(container.querySelector("[data-slot=league-promotion]")).toHaveClass("border-league-emerald"));

    const reduced = render(control(1_240, vi.fn(), "always"));
    reduced.rerender(control(1_400, vi.fn(), "always"));
    await act(async () => {});
    expect(reduced.container.querySelector("[data-slot=league-promotion]")).toBeNull();
  });
});
