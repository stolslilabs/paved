import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlayerBadge } from "../src/components/containers/player-badge";
import { ProfileProvider, type ProfileValue } from "../src/components/containers/profile-context";
import { ShieldChip } from "../src/components/elements/shield-chip";
import { formatHoursMinutes, shieldEnd, spokenHoursMinutes } from "../src/components/elements/shield-time";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOUR, MOCK_NOW } from "../src/mocks/clock";
import { PROGRESS } from "../src/mocks/players";
import { PROFILE } from "../src/mocks/scenes";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode, reduced: "never" | "always" = "never") => (
  <LazyMotion features={domMax}>
    <MotionConfig reducedMotion={reduced}>{ui}</MotionConfig>
  </LazyMotion>
);
const value: ProfileValue = { state: PROFILE.connected, progress: PROGRESS.partWay, onConnect: vi.fn(), onDisconnect: vi.fn(), onCopy: vi.fn(async () => {}) };
const LEFT = 7 * HOUR + 42 * 60;

describe("the shield's HH:MM (#806)", () => {
  it("writes hours and minutes, the minutes rounded up, never 00:00 while up", () => {
    expect(formatHoursMinutes(LEFT)).toBe("07:42");
    expect(formatHoursMinutes(LEFT - 59)).toBe("07:42");
    expect(formatHoursMinutes(LEFT - 60)).toBe("07:41");
    expect(formatHoursMinutes(8 * HOUR)).toBe("08:00");
    expect(formatHoursMinutes(42 * 60 - 20)).toBe("00:42");
    expect(formatHoursMinutes(1)).toBe("00:01");
    expect(formatHoursMinutes(0)).toBe("00:00");
    expect(formatHoursMinutes(-5)).toBe("00:00");
  });

  it("says it in words for a screen reader", () => {
    expect(spokenHoursMinutes(LEFT)).toBe("7 hours 42 minutes");
    expect(spokenHoursMinutes(HOUR + 60)).toBe("1 hour 1 minute");
    expect(spokenHoursMinutes(2 * HOUR)).toBe("2 hours");
    expect(spokenHoursMinutes(42 * 60)).toBe("42 minutes");
    expect(spokenHoursMinutes(25)).toBe("1 minute");
  });
});

describe("the shield's chip (#806)", () => {
  it("shows the shield and its HH:MM while it is up, named in words", () => {
    render(wrap(<ShieldChip endsAt={MOCK_NOW + LEFT} now={MOCK_NOW} />));
    const chip = screen.getByRole("button", { name: "Shielded, 7 hours 42 minutes left" });
    expect(chip).toHaveTextContent("07:42");
  });

  it("ticks each minute with the page's clock and leaves when the shield ends", () => {
    const endsAt = MOCK_NOW + 61;
    const { rerender, container } = render(wrap(<ShieldChip endsAt={endsAt} now={MOCK_NOW} />));
    expect(screen.getByRole("button")).toHaveTextContent("00:02");
    rerender(wrap(<ShieldChip endsAt={endsAt} now={MOCK_NOW + 30} />));
    expect(screen.getByRole("button")).toHaveTextContent("00:01");
    rerender(wrap(<ShieldChip endsAt={endsAt} now={MOCK_NOW + 60} />));
    expect(screen.getByRole("button")).toHaveTextContent("00:01");
    rerender(wrap(<ShieldChip endsAt={endsAt} now={endsAt} />));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing without a shield", () => {
    const { container, rerender } = render(wrap(<ShieldChip endsAt={null} now={MOCK_NOW} />));
    expect(container).toBeEmptyDOMElement();
    rerender(wrap(<ShieldChip endsAt={undefined} now={MOCK_NOW} />));
    expect(container).toBeEmptyDOMElement();
    rerender(wrap(<ShieldChip endsAt={MOCK_NOW - 1} now={MOCK_NOW} />));
    expect(container).toBeEmptyDOMElement();
  });

  it("a tap opens the rule: until when, no one can attack, attacking drops it; under reduced motion too", async () => {
    render(wrap(<ShieldChip endsAt={MOCK_NOW + LEFT} now={MOCK_NOW} />, "always"));
    await userEvent.click(screen.getByRole("button", { name: "Shielded, 7 hours 42 minutes left", expanded: false }));
    const popover = await screen.findByRole("dialog", { name: "Shield" });
    expect(popover).toHaveTextContent(`Your village is shielded until ${shieldEnd(MOCK_NOW + LEFT)}: no one can attack it. Attacking drops your shield.`);
    expect(shieldEnd(MOCK_NOW + LEFT)).toMatch(/^\d\d:\d\d$/);
    expect(popover.className).toMatch(/\bmotion-reduce:animate-none\b/);
  });
});

describe("the badge and the home with the shield (#806)", () => {
  it("sits beside the league badge and the crowns, inside the badge", async () => {
    const { container } = render(wrap(<ProfileProvider value={value}><PlayerBadge crowns={1_240} shieldEndsAt={MOCK_NOW + LEFT} now={MOCK_NOW} /></ProfileProvider>));
    const league = screen.getByRole("button", { name: /^League: / });
    // Its own chunk, loaded only while shielded.
    const chip = await screen.findByRole("button", { name: /^Shielded/ });
    expect(league.parentElement).toBe(chip.parentElement);
    expect(container.querySelector("[data-slot=player-badge]")!.contains(chip)).toBe(true);
  });

  it("the home shows it while shielded, and none without a shield", async () => {
    const { rerender } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.shielded} />));
    expect(await screen.findByRole("button", { name: "Shielded, 7 hours 42 minutes left" })).toHaveTextContent("07:42");
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.shieldLastMinute} />));
    expect(screen.getByRole("button", { name: "Shielded, 1 minute left" })).toHaveTextContent("00:01");
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />));
    expect(screen.queryByRole("button", { name: /^Shielded/ })).toBeNull();
  });
});
