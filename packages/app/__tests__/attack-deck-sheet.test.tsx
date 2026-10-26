import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanType } from "@paved/game-core";
import { slow } from "../test-slow";
import { attackDeckSheet, type AttackDeckSheet } from "../src/lib/attack-deck-sheet";
import { DeckSheet } from "../src/components/containers/deck-sheet";
import { UnknownTileChip } from "../src/components/elements/tile-chip";
import { PvpAttackScene } from "../src/components/scenes/pvp-attack-scene";
import { PVP_V2_ATTACK, V2_ATTACK_STEPS, V2_DECK, V2_DECK_SIZE, attackV2Deck } from "../src/mocks/pvp-v2";

// V2-DECK-SHEET (#789, owner decisions of 2026-10-26): the attack's deck sheet, the defender's tiles by plan and the extras drawn
// at random as unknown cards, the played ones crossed out, the counts adding up to the deck's size.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);
const A = id(PlanType.CCCCCFFFC);
const B = id(PlanType.FFFFCCCFF);
const C = id(PlanType.RFRFFFFFR);

afterEach(cleanup);

const states = (sheet: AttackDeckSheet) => Object.fromEntries(sheet.plans.map((p) => [p.plan, p.cards]));

describe("attackDeckSheet: which card a played tile crosses (#789 open point 1)", () => {
  it("groups the defender's tiles by plan and adds the extras as unknown cards, as many as size − placed", () => {
    const sheet = attackDeckSheet({ defenderPlans: [B, A, B], size: 5, moves: [], view: [] });
    expect(sheet.plans.map((p) => p.plan)).toEqual([A, B]);
    expect(states(sheet)).toEqual({ [A]: ["left"], [B]: ["left", "left"] });
    expect(sheet.extras).toEqual([{ plan: null, state: "left" }, { plan: null, state: "left" }]);
    expect(sheet).toMatchObject({ size: 5, placed: 0, discarded: 0, left: 5 });
  });

  it("crosses one of the defender's cards of the plan played while some are left, else an extra, which then shows that plan", () => {
    const sheet = attackDeckSheet({ defenderPlans: [A, B], size: 4, moves: [{ plan: A, discard: false }, { plan: A, discard: true }], view: [] });
    expect(states(sheet)).toEqual({ [A]: ["placed"], [B]: ["left"] });
    expect(sheet.extras).toEqual([{ plan: A, state: "discarded" }, { plan: null, state: "left" }]);
    expect(sheet).toMatchObject({ placed: 1, discarded: 1, left: 2 });
  });

  it("marks the tile in hand and the next two by the same rule, an extra seen showing its plan", () => {
    const sheet = attackDeckSheet({ defenderPlans: [A, B, B], size: 5, moves: [{ plan: B, discard: false }], view: [B, C, A] });
    expect(states(sheet)).toEqual({ [A]: ["next"], [B]: ["placed", "hand"] });
    expect(sheet.extras).toEqual([{ plan: C, state: "next" }, { plan: null, state: "left" }]);
    // The seen tiles are still to draw: the tiles left count them.
    expect(sheet.left).toBe(4);
  });

  it("keeps the deck at least the defender's tiles", () => {
    expect(attackDeckSheet({ defenderPlans: [A, B, C], size: 2, moves: [], view: [] })).toMatchObject({ size: 3, extras: [] });
  });

  it("always adds up: the tiles left plus the played ones make the deck's size, at every step of the stories' attack", () => {
    for (let i = 0; i < V2_ATTACK_STEPS.length; i++) {
      const sheet = attackV2Deck(i);
      const cards = [...sheet.plans.flatMap((p) => p.cards), ...sheet.extras.map((e) => e.state)];
      expect(cards).toHaveLength(V2_DECK_SIZE);
      expect(sheet.left + sheet.placed + sheet.discarded).toBe(V2_DECK_SIZE);
      expect(sheet.placed + sheet.discarded).toBe(i);
      // The stack's badge says the same.
      expect(sheet.left).toBe(V2_ATTACK_STEPS[i]!.remaining);
      expect(cards.filter((s) => s === "hand")).toHaveLength(i < V2_DECK.length ? 1 : 0);
    }
  });
});

describe("the unknown tile (#789)", () => {
  it("is named Unknown tile at every chip size, and takes the chip's states", () => {
    render(
      <>
        {(["sm", "md", "lg", "xl"] as const).map((size) => (
          <UnknownTileChip key={size} size={size} state={size === "lg" ? "selected" : undefined} />
        ))}
      </>,
    );
    const chips = screen.getAllByRole("img", { name: "Unknown tile" });
    expect(chips).toHaveLength(4);
    expect(chips.map((c) => c.getAttribute("data-state"))).toEqual(["default", "default", "selected", "default"]);
    expect(chips[0]).toHaveTextContent("?");
  });
});

describe("the deck sheet's attack mode (#789)", () => {
  it("shows the village's tiles by plan, the extras as unknown cards, the played ones crossed out and the tiles left", () => {
    const attack = attackV2Deck(10);
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "attack", attack }} side="bottom" />);
    const village = screen.getByTestId("deck-plans");
    const extras = screen.getByTestId("deck-extras");
    expect(within(village).getAllByRole("img")).toHaveLength(V2_DECK_SIZE - attack.extras.length);
    expect(within(extras).getAllByRole("img")).toHaveLength(attack.extras.length);
    const unknown = attack.extras.filter((e) => e.plan === null).length;
    expect(within(extras).queryAllByRole("img", { name: "Unknown tile" })).toHaveLength(unknown);
    const sheet = screen.getByRole("dialog", { name: "Deck" });
    expect(sheet.querySelectorAll("[data-out='true']")).toHaveLength(10);
    expect(sheet.querySelectorAll("[data-state='selected']")).toHaveLength(1);
    expect(sheet.querySelectorAll("[data-next='true']")).toHaveLength(2);
    expect(screen.getByText(new RegExp(`^${V2_DECK_SIZE - 10} tiles left of ${V2_DECK_SIZE}`))).toBeInTheDocument();
    expect(screen.getByTestId("deck-summary")).toHaveTextContent(`${attack.placed} played, ${attack.discarded} discarded (dashed), ${V2_DECK_SIZE - 10} not yet.`);
  });

  it("reveals an extra once drawn: at the end every card is out, none unknown", () => {
    render(<DeckSheet open onOpenChange={() => {}} deck={{ mode: "attack", attack: attackV2Deck(V2_DECK.length) }} side="bottom" />);
    expect(screen.queryAllByRole("img", { name: "Unknown tile" })).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Deck" }).querySelectorAll("[data-out='true']")).toHaveLength(V2_DECK_SIZE);
    expect(screen.getByText(new RegExp(`^0 tiles left of ${V2_DECK_SIZE}`))).toBeInTheDocument();
  });

  it("opens from the attack's stack, as in the other modes", async () => {
    render(wrap(<PvpAttackScene {...PVP_V2_ATTACK.midway} />));
    await userEvent.click(screen.getByRole("button", { name: /^Tiles left: \d+\. Show the deck$/ }));
    const sheet = await screen.findByRole("dialog", { name: "Deck" }, { timeout: slow(5000) });
    expect(within(sheet).getByTestId("deck-extras")).toBeInTheDocument();
    expect(within(sheet).getAllByRole("img", { name: "Unknown tile" }).length).toBeGreaterThan(0);
  });

  it("keeps v1's attack without a sheet: no deck, no handler", () => {
    render(wrap(<PvpAttackScene {...PVP_V2_ATTACK.midway} deck={null} />));
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toBeDisabled();
  });
});
