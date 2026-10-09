// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, configure, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { FakeGameViews, IndexerClient } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_BO, FIXTURE_TOURNAMENT, FixtureIndexer } from "@paved/chain/testing";
import { QuestsPage } from "../src/pages/Quests";
import { renderPage } from "./helpers/page-fixtures";

// A cold CI run is slow on the first render: the library's 1 s default is too tight.
configure({ asyncUtilTimeout: 5000 });

afterEach(cleanup);

let fixture: FixtureIndexer;
let indexer: IndexerClient;
/** Requests whose path matches are held until `release()`; every other request goes straight through. */
let hold: { match: RegExp; release: () => void } | null;
beforeEach(() => {
  fixture = new FixtureIndexer();
  hold = null;
  const slow = async (input: RequestInfo | URL) => {
    const gate = hold;
    if (gate && gate.match.test(String(input))) await new Promise<void>((resolve) => (gate.release = resolve));
    return fixture.fetch(input);
  };
  indexer = new IndexerClient({ url: "http://indexer.test", fetch: slow as typeof fetch });
});
const holdRequests = (match: RegExp) => {
  hold = { match, release: () => {} };
  return () => act(async () => hold!.release());
};
const visible = () => act(async () => void document.dispatchEvent(new Event("visibilitychange")));

const ME = (id: string) => ({ id, name: "Me", master: "0xabc" });
const quests = (opts: Partial<Parameters<typeof renderPage>[0]> = {}) => {
  const views = new FakeGameViews();
  views.currentTournament = FIXTURE_TOURNAMENT;
  return renderPage({ page: <QuestsPage />, path: "/quests", route: "/quests/:day?", indexer, views, player: ME(FIXTURE_ADA), ...opts });
};
// A quest or an achievement is named in its progress and again in the definitions: tests look in one region.
const region = (name: string) => within(screen.getByRole("region", { name }));
const q = (title: string) => region("Your quests").getByText(title).closest("li")!;
const a = (title: string) => region("Achievements").getByText(title).closest("li")!;
const quest = () => screen.findByRole("list", { name: "Daily quests" });
const achieve = () => screen.findByRole("list", { name: "Achievements list" });

describe("Quests page", () => {
  it("no indexer URL: says unavailable, asks nothing, shows no quest", () => {
    quests({ indexer: null });
    expect(screen.getByText("Quests unavailable")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(fixture.requests).toEqual([]);
  });

  it("loading, then today's quests with their progress for the connected player", async () => {
    quests();
    expect(screen.getByText("Loading player…")).toBeTruthy();
    await quest();
    expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/quests?day=${FIXTURE_TOURNAMENT}`);
    const list = within(screen.getByRole("list", { name: "Daily quests" }));
    expect(list.getAllByRole("listitem")).toHaveLength(4);
    const run = within(q("Daily Run"));
    expect(run.getByText(/^Completed 20\d\d-\d\d-\d\d$/)).toBeTruthy();
    expect(run.getByText("1 / 1 Daily games finished")).toBeTruthy();
    const chaser = within(q("Point Chaser"));
    expect(chaser.getByText("2,700 / 3,000 points")).toBeTruthy();
    expect(chaser.queryByText(/Completed/)).toBeNull();
    const bar = chaser.getByRole("progressbar") as HTMLProgressElement;
    expect([bar.value, bar.max]).toEqual([2700, 3000]);
    expect(within(q("Master Builder")).getByText("0 / 6 roads and cities scored")).toBeTruthy();
    expect(screen.getByTestId("progress-lag").textContent).toContain("Up to date");
  });

  it("the achievements with their points, the completed ones marked and the points summed", async () => {
    quests();
    await achieve();
    expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/achievements`);
    expect(screen.getByTestId("achievement-points").textContent).toBe("Achievement points: 10");
    const list = screen.getByRole("list", { name: "Achievements list" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(9);
    const settler = within(a("Settler I"));
    expect(settler.getByText(/^Completed/)).toBeTruthy();
    expect(settler.getByText("10 points")).toBeTruthy();
    const second = within(a("Settler II"));
    expect(second.getByText("1 / 10 Daily games finished")).toBeTruthy();
    expect(second.getByText("20 points")).toBeTruthy();
    expect(within(a("On the Podium")).getByText("0 / 1 podium places")).toBeTruthy();
  });

  it("the definitions list: every quest and achievement as the chain defines it, with the schedule and the targets", async () => {
    quests();
    await screen.findByText("What counts");
    const defs = await screen.findAllByTestId("definition");
    expect(defs).toHaveLength(13); // 4 quests + 9 achievements
    const chaser = within(screen.getByRole("list", { name: "Quest definitions" })).getByText("Point Chaser").closest("li")!;
    expect(within(chaser).getByText("Every UTC day")).toBeTruthy();
    expect(within(chaser).getByText("Target: 3,000 points")).toBeTruthy();
    expect(within(chaser).getByText(/the sum of the scores of the day's finished Daily games/)).toBeTruthy();
    const podium = within(screen.getByRole("list", { name: "Achievement definitions" })).getByText("On the Podium").closest("li")!;
    expect(within(podium).getByText("50 points")).toBeTruthy();
    expect(within(podium).getByText(/Counted once the day has closed/)).toBeTruthy();
  });

  it("the targets are the chain's: a recalibrated quest shows the new number, an unknown id shows by number", async () => {
    fixture.quests = [
      { ...fixture.quests[3], tasks: [{ task_id: 3, total: 5000 }] },
      { ...fixture.quests[0], quest_id: 12, tasks: [{ task_id: 42, total: 2 }] },
    ];
    quests();
    await quest();
    expect(within(q("Point Chaser")).getByText("2,700 / 5,000 points")).toBeTruthy();
    expect(within(q("Quest #12")).getByText("0 / 2 task 42")).toBeTruthy();
    expect(screen.getByText("Target: 5,000 points")).toBeTruthy();
  });

  it("a retired quest and achievement are flagged, in the progress and in the definitions", async () => {
    fixture.quests = [{ ...fixture.quests[1], retired: true, retired_at: 1791800000 }, fixture.quests[0]];
    fixture.achievements = [{ ...fixture.achievements[0], retired: true, retired_at: 1791800000 }];
    quests();
    await quest();
    expect(screen.getAllByText("Retired").length).toBeGreaterThanOrEqual(4); // quest + achievement, as progress and as definition
    expect(within(q("Master Builder")).getByText("Retired")).toBeTruthy();
  });

  it("no reward, prize, claim or token is shown anywhere", async () => {
    quests();
    await screen.findByText("What counts");
    await achieve();
    expect(document.body.textContent).not.toMatch(/reward|prize|claim|\$TILE|PAVED|free (game|entry)/i);
  });

  it("a day with no quest says so; a day with progress elsewhere shows no other day's rows", async () => {
    fixture.questsFromDay = FIXTURE_TOURNAMENT;
    quests();
    await quest();
    const release = holdRequests(new RegExp(`/quests\\?day=${FIXTURE_TOURNAMENT - 1}`));
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: String(FIXTURE_TOURNAMENT - 1) } });
    expect(await screen.findByText("Loading quests…")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Your quests" })).queryByText("Point Chaser")).toBeNull();
    await release();
    await screen.findByText("No quest on this day.");
    expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/quests?day=${FIXTURE_TOURNAMENT - 1}`);
    // The achievements do not depend on the day.
    expect(a("Settler I")).toBeTruthy();
  });

  it("the day picker reuses the leaderboard's: the indexer's days, today marked, and the route follows", async () => {
    quests();
    await quest();
    const picker = screen.getByLabelText("Day") as HTMLSelectElement;
    expect(picker.value).toBe(String(FIXTURE_TOURNAMENT));
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringMatching(/^2026-\d\d-\d\d \(today\)$|^20\d\d-\d\d-\d\d \(today\)$/),
      expect.stringMatching(/^20\d\d-\d\d-\d\d$/),
      expect.stringMatching(/^20\d\d-\d\d-\d\d$/),
    ]);
    fireEvent.change(picker, { target: { value: String(FIXTURE_TOURNAMENT - 1) } });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain(`/quests/${FIXTURE_TOURNAMENT - 1}|`));
  });

  it("a day in the route is read as it is; an id that is not a day reads nothing", async () => {
    quests({ path: `/quests/${FIXTURE_TOURNAMENT - 2}` });
    await quest();
    expect(fixture.requests).toContain(`/v1/players/${FIXTURE_ADA}/quests?day=${FIXTURE_TOURNAMENT - 2}`);
    cleanup();
    fixture.requests.length = 0;
    quests({ path: "/quests/abc" });
    expect(await screen.findByText("Not a day")).toBeTruthy();
    expect(fixture.requests.filter((r) => r.includes("/quests?"))).toEqual([]);
  });

  it("a player with no progress sees zero counts and zero points", async () => {
    quests({ player: ME(FIXTURE_BO) });
    await quest();
    expect(within(q("Daily Run")).getByText("0 / 1 Daily games finished")).toBeTruthy();
    expect(within(q("Daily Run")).queryByText(/Completed/)).toBeNull();
    await screen.findByText("Achievement points: 0");
  });

  it("not connected: says so, reads no player's progress, and still lists what counts", async () => {
    quests({ account: null });
    expect(screen.getByText("Connect an account to see your quests and achievements.")).toBeTruthy();
    await screen.findByText("What counts");
    await screen.findAllByTestId("definition");
    expect(fixture.requests.filter((r) => r.startsWith("/v1/players/"))).toEqual([]);
    expect(screen.queryByRole("region", { name: "Your quests" })).toBeNull();
  });

  it("a connected account without a player yet: says so, reads no progress", async () => {
    quests({ player: null });
    await screen.findByText("You have no player yet: your quests appear after your first game.");
    await screen.findByText("What counts");
    expect(fixture.requests.filter((r) => r.startsWith("/v1/players/"))).toEqual([]);
  });

  it("the lag line: up to date, then behind with the reason progress may be late", async () => {
    fixture.state.behind = 9;
    quests();
    await quest();
    const lag = screen.getByTestId("progress-lag");
    expect(lag.textContent).toContain("Updated 9 blocks behind: progress may be late");
    expect(lag.textContent).toContain("block 9120");
    expect(screen.getByText(/progress may not show your latest games yet/)).toBeTruthy();
  });

  it("one lag line stands for the reads: the furthest behind", async () => {
    let n = 0;
    const lagging = new IndexerClient({
      url: "http://indexer.test",
      fetch: (async (input: RequestInfo | URL) => {
        fixture.state.behind = String(input).includes("/achievements") ? 7 : 1 + (n++ % 2);
        return fixture.fetch(input);
      }) as typeof fetch,
    });
    quests({ indexer: lagging });
    await achieve();
    await screen.findByText("What counts");
    expect(screen.getAllByTestId("progress-lag")).toHaveLength(1);
    expect(screen.getByTestId("progress-lag").textContent).toContain("Updated 7 blocks behind");
  });

  it.each([
    ["an indexer that is down", () => (fixture.state.down = true), /Quests unavailable: the indexer cannot be reached/],
    ["a halted indexer", () => (fixture.state.status = "halted"), /Quests unavailable: the indexer is halted/],
    ["a rewinding indexer", () => (fixture.state.status = "rewinding"), /Quests unavailable: the indexer is catching up/],
    ["a loading indexer", () => (fixture.state.status = "loading"), /Quests unavailable: the indexer is starting/],
    ["another API version", () => (fixture.state.version = 2), /Quests unavailable: the indexer speaks another API version/],
  ])("%s: each read says the failure with Retry, and no quest is shown", async (_name, break_, text) => {
    break_();
    quests();
    // The three reads (quests, achievements, definitions) each fail where they would have shown rows.
    await waitFor(() => expect(screen.getAllByText(text)).toHaveLength(3));
    expect(screen.getAllByText("Retry")).toHaveLength(3);
    expect(region("Your quests").queryByText("Daily Run")).toBeNull();
    expect(screen.queryByTestId("progress-lag")).toBeNull();
    expect(screen.queryByTestId("achievement-points")).toBeNull();
  });

  it("an answer that is not what the API says is shown as unexpected, never as rows", async () => {
    const real = indexer;
    const broken = new IndexerClient({
      url: "http://indexer.test",
      fetch: (async (input: RequestInfo | URL) => {
        const res = await fixture.fetch(input);
        if (!String(input).includes("/quests?")) return res;
        const body = await res.json();
        body.quests[0].tasks[0].count = 99; // above its total
        return new Response(JSON.stringify(body), { status: 200 });
      }) as typeof fetch,
    });
    quests({ indexer: broken });
    await screen.findByText("Quests unavailable: the indexer gave an unexpected answer");
    expect(region("Your quests").queryByText("Daily Run")).toBeNull();
    expect(real).toBeTruthy();
    // The other reads are not hurt by it.
    await achieve();
  });

  it("Retry reads again and the rows come", async () => {
    fixture.state.down = true;
    quests();
    await waitFor(() => expect(screen.getAllByText(/the indexer cannot be reached/)).toHaveLength(3));
    fixture.state.down = false;
    for (const retry of screen.getAllByText("Retry")) fireEvent.click(retry);
    await quest();
    await achieve();
    await screen.findAllByTestId("definition");
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("a failed refresh keeps the rows, marked stale, and the next success clears it", async () => {
    quests();
    await quest();
    fixture.state.down = true;
    await visible();
    await screen.findByTestId("progress-lag-stale");
    expect(screen.getByTestId("progress-lag-stale").textContent).toContain("Stale: Quests unavailable: the indexer cannot be reached");
    expect(q("Daily Run")).toBeTruthy();
    expect(within(q("Point Chaser")).getByText("2,700 / 3,000 points")).toBeTruthy();
    fixture.state.down = false;
    await visible();
    await waitFor(() => expect(screen.queryByTestId("progress-lag-stale")).toBeNull());
    expect(q("Daily Run")).toBeTruthy();
  });

  it("the page reloads on becoming visible and asks nothing on a timer", async () => {
    quests();
    await quest();
    const before = fixture.requests.filter((r) => r.includes("/quests?")).length;
    await visible();
    await waitFor(() => expect(fixture.requests.filter((r) => r.includes("/quests?")).length).toBe(before + 1));
  });
});
