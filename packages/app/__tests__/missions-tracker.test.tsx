import { slow } from "../test-slow";
import { cleanup as cleanupAll, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TUTORIAL_TASKS, emptyTutorialCounts } from "@paved/game-core";
import { MissionsTracker } from "../src/components/containers/missions-tracker";
import { missionKeyOf, trackerState, type TrackerState } from "../src/components/containers/missions-tracker-lines";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { MOCK_NOW } from "../src/mocks/clock";
import { TRACKER } from "../src/mocks/missions-tracker";
import { QUESTS_TODAY, QUESTS_TODAY_ALL_DONE, QUESTS_TODAY_FRESH } from "../src/mocks/quests";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

// MISSIONS-TRACKER (#978): the home's preview of the three missions closest to done, the Tutorial's step first.

const wrap = (node: ReactNode) => <LazyMotion features={domMax}>{node}</LazyMotion>;
const tutorial = (done: number, claimed: number) => {
  const counts = { ...emptyTutorialCounts(), level: done >= 8 ? 3 : 1 };
  TUTORIAL_TASKS.slice(0, Math.min(done, 7)).forEach((t) => (counts[t] = 1));
  return { counts, claimed };
};
const keys = (state: TrackerState) => (state.kind === "lines" ? state.lines.map((l) => (l.claim ? `${l.key} claim` : l.key)) : state.kind);

describe("which missions the tracker shows (#978's point 3)", () => {
  it("a new player: the Tutorial's open step first, then the dailies (a tie at 0: the one whose window ends first, the day's)", () => {
    expect(keys(trackerState({ quests: QUESTS_TODAY_FRESH, tutorial: tutorial(0, 0), now: MOCK_NOW }))).toEqual(["tutorial:1", "quest:1", "quest:6"]);
  });

  it("a step done and not claimed comes first with Claim, then the open step, then the quest the furthest along", () => {
    const state = trackerState({ quests: QUESTS_TODAY, tutorial: tutorial(3, 0b11), now: MOCK_NOW });
    expect(keys(state)).toEqual(["tutorial:3 claim", "tutorial:4", "quest:15"]);
    expect(state.kind === "lines" && state.lines[2]).toMatchObject({ title: "Weekly Builder", count: 22, total: 30, kind: "weekly" });
  });

  it("the Tutorial claimed whole (or not served): the quests not done, the furthest along first, never a done one nor a lifetime one", () => {
    // Weekly Builder 22 / 30, Weekly Points 12,400 / 20,000, Weekly Forester 3 / 5; Daily Run (done) is left out.
    expect(keys(trackerState({ quests: QUESTS_TODAY, tutorial: tutorial(8, 0xff), now: MOCK_NOW }))).toEqual(["quest:15", "quest:16", "quest:14"]);
    expect(keys(trackerState({ quests: QUESTS_TODAY, tutorial: null, now: MOCK_NOW }))).toEqual(["quest:15", "quest:16", "quest:14"]);
  });

  it("on a tie of progress, the one that resets first: a daily before a weekly", () => {
    const quests = { ...QUESTS_TODAY_FRESH, quests: QUESTS_TODAY_FRESH.quests.filter((q) => [14, 6].includes(q.questId)) };
    expect(keys(trackerState({ quests, tutorial: null, now: MOCK_NOW }))).toEqual(["quest:6", "quest:14"]);
  });

  it("several steps to claim fill the lines; fewer missions, fewer lines; none, All done with the day's reset", () => {
    expect(keys(trackerState({ quests: QUESTS_TODAY, tutorial: tutorial(3, 0), now: MOCK_NOW }))).toEqual(["tutorial:1 claim", "tutorial:2 claim", "tutorial:3 claim"]);
    expect(keys(TRACKER.oneLeft)).toEqual(["quest:21"]);
    const done = trackerState({ quests: QUESTS_TODAY_ALL_DONE, tutorial: tutorial(8, 0xff), now: MOCK_NOW });
    expect(done).toEqual({ kind: "done", resetsAt: (Math.floor(MOCK_NOW / 86_400) + 1) * 86_400 });
    // The last step done and not claimed keeps the Tutorial in.
    expect(keys(trackerState({ quests: QUESTS_TODAY_ALL_DONE, tutorial: tutorial(8, 0x7f), now: MOCK_NOW }))).toEqual(["tutorial:8 claim"]);
  });

  it("a link's mission is read as a key only when it is one", () => {
    expect(missionKeyOf("quest:12")).toBe("quest:12");
    expect(missionKeyOf("tutorial:3")).toBe("tutorial:3");
    expect(missionKeyOf("achievement:4")).toBe("achievement:4");
    for (const bad of [null, "", "quest", "quest:0", "quest:-1", "quest:1x", "bonus:1", "quest:1234567"]) expect(missionKeyOf(bad)).toBeUndefined();
  });
});

describe("the tracker's panel", () => {
  it("draws a line per mission: its title, its bar and count, or Claim; a tap opens that mission", async () => {
    const onOpen = vi.fn();
    render(wrap(<MissionsTracker state={TRACKER.midWay} badge={3} now={MOCK_NOW} onOpen={onOpen} />));
    const nav = screen.getByRole("navigation", { name: "Missions, 3 waiting" });
    const lines = within(nav).getAllByRole("button");
    expect(lines.map((b) => b.getAttribute("aria-label"))).toEqual(["Raider: done, claim its Cobbles", "Victor: 0 of 1", "Weekly Builder: 22 of 30"]);
    expect(within(lines[0]!).getByText("Claim")).toBeInTheDocument();
    expect(within(lines[0]!).queryByRole("progressbar", { hidden: true })).toBeNull();
    expect(within(lines[2]!).getByText("22 / 30")).toBeInTheDocument();
    expect(within(lines[2]!).getByRole("progressbar", { hidden: true })).toHaveAttribute("aria-valuenow", String((22 / 30) * 100));
    // The badge is the Missions button's count, on the panel's corner.
    expect(within(nav).getByText("3")).toBeInTheDocument();
    for (const line of lines) await userEvent.click(line);
    expect(onOpen.mock.calls).toEqual([["tutorial:3"], ["tutorial:4"], ["quest:15"]]);
  });

  it("keeps the title on one line with an ellipsis, and big counts compact", () => {
    render(wrap(<MissionsTracker state={TRACKER.questsOnly} now={MOCK_NOW} />));
    const title = screen.getByText("Weekly Points");
    expect(title.className.split(" ")).toContain("truncate");
    expect(screen.getByText("12.4K / 20K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weekly Points: 12,400 of 20,000" })).toBeInTheDocument();
  });

  it("All done: one line with the countdown to the day's reset; a tap opens the page", async () => {
    const onOpen = vi.fn();
    render(wrap(<MissionsTracker state={TRACKER.allDone} now={MOCK_NOW} onOpen={onOpen} />));
    const line = screen.getByRole("button", { name: "All done: open the missions" });
    expect(within(line).getByRole("timer")).toHaveAccessibleName(/^Missions reset in \d+:\d\d:\d\d$/);
    await userEvent.click(line);
    expect(onOpen).toHaveBeenCalledWith();
  });

  it("not read yet: a skeleton of three lines; a guest: one line to the page", () => {
    const { unmount } = render(wrap(<MissionsTracker state={null} now={MOCK_NOW} />));
    expect(screen.getByRole("status", { name: "Loading the missions" })).toBeInTheDocument();
    unmount();
    render(wrap(<MissionsTracker state={TRACKER.none} now={MOCK_NOW} />));
    expect(screen.getByRole("navigation", { name: "Missions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the missions" })).toBeInTheDocument();
  });

  it("the bars fill with a transition reduced motion turns off", () => {
    render(wrap(<MissionsTracker state={TRACKER.midWay} now={MOCK_NOW} />));
    const bar = screen.getAllByRole("progressbar", { hidden: true })[0]!.querySelector("[data-slot=progress-indicator]")!;
    expect(bar.className.split(" ")).toEqual(expect.arrayContaining(["transition-transform", "motion-reduce:transition-none"]));
  });
});

describe("short of room in the home's left column", () => {
  /** A left column `height` px tall (12 px gaps) holding a control `above` px tall, a social column `social` px (76 px at least), then the panel. */
  function inColumn(height: number, above: number, social?: number) {
    // jsdom lays nothing out: the sizes the browser would give, read off `data-h`.
    const h = (el: HTMLElement) => Number(el.dataset.h ?? 0);
    const stubs = [
      vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{}] as unknown as DOMRectList),
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
        return h(this);
      }),
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
        return h(this);
      }),
    ];
    render(
      wrap(
        <div data-slot="scroll-region" data-h={height} style={{ rowGap: "12px" }}>
          <div data-h={above} />
          <MissionsTracker state={TRACKER.midWay} now={MOCK_NOW} />
          {social !== undefined && <nav aria-label="Social" data-h={social} style={{ minHeight: "76px" }} />}
        </div>,
      ),
    );
    const shown = within(screen.getByRole("navigation", { name: "Missions" })).getAllByRole("button");
    for (const stub of stubs) stub.mockRestore();
    return shown.map((b) => b.getAttribute("aria-label")!.split(":")[0]);
  }

  it("shows the lines that fit, the first ones, down to one, before the column scrolls", () => {
    // 400 - 100 - 12 - 30 (its frame) = 258: three lines of 44.
    expect(inColumn(400, 100)).toEqual(["Raider", "Victor", "Weekly Builder"]);
  });

  it("drops the last lines first", () => {
    // 260 - 100 - 12 - 30 = 118: two lines.
    expect(inColumn(260, 100)).toEqual(["Raider", "Victor"]);
  });

  it("keeps one line however short the column", () => {
    expect(inColumn(120, 100)).toEqual(["Raider"]);
  });

  it("counts the social column (#973) at its minimum: it shrinks first", () => {
    // 360 - 100 - 76 - 24 - 30 = 130: two lines, though the social column is drawn 200 px tall.
    expect(inColumn(360, 100, 200)).toEqual(["Raider", "Victor"]);
    cleanupAll();
    // 400 - 100 - 76 - 24 - 30 = 170: three lines.
    expect(inColumn(400, 100, 200)).toEqual(["Raider", "Victor", "Weekly Builder"]);
  });
});

describe("the tracker on the home (#978)", () => {
  it("takes the Missions button's place in the left column, under the score; the Camera mode fades it; edit mode hides it", async () => {
    const onMissions = vi.fn();
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.trackerNewPlayer} onMissions={onMissions} />));
    const tracker = await screen.findByRole("navigation", { name: "Missions" }, { timeout: slow(5000) });
    expect(screen.queryByRole("button", { name: /^Missions/ })).toBeNull();
    expect(tracker.closest("[data-fade]")).not.toBeNull();
    expect(tracker.closest("[data-slot=scroll-region]")).not.toBeNull();
    await userEvent.click(within(tracker).getByRole("button", { name: "Builder: 0 of 1" }));
    expect(onMissions).toHaveBeenCalledWith("tutorial:1");
    unmount();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.editing} />));
    expect(screen.queryByRole("navigation", { name: /^Missions/ })).toBeNull();
  });
});
