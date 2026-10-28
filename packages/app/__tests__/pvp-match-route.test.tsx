import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { formatInteger } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { attackV2Board } from "../src/data/free-attack";
import type { MockLedger } from "../src/data/mock/ledger";
import { mockRivalV2 } from "../src/data/mock/v2";
import { resetManifestBodies } from "../src/data/renderer-manifest";
import { resetTileRenders } from "../src/data/tile-renders";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The League's matches and a match's page (#786) on the mock: an attack made and a rival's answer on the player's village, as
// cards; a card opens `/pvp/match/:id`, whose two views show the snapshot and the build, and whose Back lands on the League.

const WAIT = { timeout: slow(8000) };

/** One whole attack of `me`'s on the mock: drawn, started, every tile played where it first fits (else discarded). */
async function attackOnce(ledger: MockLedger, me: string) {
  await ledger.drawOpponentV2(me, "search");
  await ledger.startAttackV2(me);
  for (;;) {
    const { attack } = await ledger.attackV2(me);
    if (attack!.status !== "open") return attack!;
    const board = attackV2Board(attack!);
    const plan = attack!.view[0]!;
    const cell = board.slots(plan)[0];
    await ledger.playAttackV2(me, cell ? { discard: false, orientation: board.orientations(plan, cell)[0]!, cell } : { discard: true });
  }
}

/** The app on `path`, the player having attacked once and been answered once. */
async function open(path: string) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await s.ledger.foundFreeVillage(me);
  const attack = await attackOnce(s.ledger, me);
  await s.ledger.drawOpponentV2(me, "search");
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  return { ...s, me, attack, rival: mockRivalV2(attack.defender)!, router };
}

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp-league"), import("../src/routes/pages/pvp-match")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  vi.unstubAllGlobals();
  resetTileRenders();
  resetManifestBodies();
});

describe("the League's matches and a match (#786)", { timeout: slow(60_000) }, () => {
  it("lists the attack and the defence as cards, newest first; a card opens its match, whose Back lands on the League", async () => {
    // The manifest: the battle logs' backgrounds (#857), the build's renders as the Story's.
    resetTileRenders();
    resetManifestBodies();
    const renders = { "0": { "battle-attack-720": "renders/battle-attack-720.0.a.webp", "battle-attack-1040": "renders/battle-attack-1040.0.b.webp", "battle-defence-1040": "renders/battle-defence-1040.0.c.webp" } };
    vi.stubGlobal("fetch", (url: string) => Promise.resolve(String(url).endsWith("manifest.json") ? new Response(JSON.stringify({ models: {}, renders, themes: {} })) : new Response("", { status: 404 })));
    const s = await open("/pvp/league");
    const list = await screen.findByRole("list", { name: "Matches" }, WAIT);
    const cards = within(list).getAllByRole("button");
    expect(cards.map((c) => c.dataset.side)).toEqual(["defence", "attack"]);
    expect(cards[1]).toHaveAccessibleName(`Your attack on ${s.rival.name}: ${s.attack.stars} of 3 stars`);
    // The defence shielded the village (8 hours, until the player attacks).
    expect(screen.getByRole("region", { name: "Shield" })).toHaveAttribute("data-shield", "on");
    // Each card on its side's background (#834), the build's render at each width it has (#857), no plan view behind it.
    await waitFor(
      () =>
        expect(cards.map((c) => c.querySelector("[data-slot=match-art] img")?.getAttribute("srcset"))).toEqual([
          expect.stringMatching(/^\S*battle-defence-1040\.0\.c\.webp 1040w$/),
          expect.stringMatching(/^\S*battle-attack-720\.0\.a\.webp 720w, \S*battle-attack-1040\.0\.b\.webp 1040w$/),
        ]),
      WAIT,
    );
    expect(cards.every((c) => c.querySelector("[inert]") === null)).toBe(true);

    await userEvent.click(cards[1]!);
    await waitFor(() => expect(s.router.state.location.pathname).toBe(`/pvp/match/a${s.attack.id}`), WAIT);
    expect(await screen.findByRole("heading", { name: `Attack on ${s.rival.name}` }, WAIT)).toBeInTheDocument();
    const views = screen.getByRole("radiogroup", { name: "Match view" });
    expect(within(views).getAllByRole("radio")[0]).toHaveAccessibleName(`Village, ${formatInteger(s.rival.score)} points`);
    // The village's view: the snapshot, the starter and the rival's tiles; the build's: the attack's placed tiles and the starter.
    const board = () => document.querySelector<HTMLElement>("[data-view]")!;
    expect(board()).toHaveAttribute("data-view", "village");
    expect(within(board()).getByRole("img", { name: `Board of ${s.rival.tiles.length + 1} tiles` })).toBeInTheDocument();
    await userEvent.click(within(views).getAllByRole("radio")[1]!);
    expect(board()).toHaveAttribute("data-view", "build");
    const placed = s.attack.moves.filter((m) => !m.discard).length;
    expect(within(board()).getByRole("img", { name: `Board of ${placed + 1} tiles` })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Replay" })).getByText(`${s.attack.moves.length}/${s.attack.moves.length}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous move" }));
    expect(within(screen.getByRole("group", { name: "Replay" })).getByText(`${s.attack.moves.length - 1}/${s.attack.moves.length}`)).toBeInTheDocument();
    // The build opens whole: Play replays it from the start, move by move (open point 2).
    await userEvent.click(screen.getByRole("button", { name: "Next move" }));
    const replay = () => screen.getByRole("group", { name: "Replay" });
    await userEvent.click(within(replay()).getByRole("button", { name: "Play from the start" }));
    await waitFor(() => expect(within(replay()).getByText(`1/${s.attack.moves.length}`)).toBeInTheDocument(), WAIT);
    await waitFor(() => expect(within(replay()).getByText(`2/${s.attack.moves.length}`)).toBeInTheDocument(), WAIT);
    await userEvent.click(within(replay()).getByRole("button", { name: "Pause" }));

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/pvp/league"), WAIT);
    expect(await screen.findByRole("list", { name: "Matches" }, WAIT)).toBeInTheDocument();
  });

  it("a defence's page: the player's village as it was, the rival's attack; opened by a link, Back goes up to the League", async () => {
    const s = await open("/pvp/match/d1");
    expect(await screen.findByRole("heading", { name: `Defence: ${s.rival.name}` }, WAIT)).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "Match view" })).getByText("Your village")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(s.router.state.location.pathname).toBe("/pvp/league"), WAIT);
  });

  it("an unknown match says so; a malformed id is not found", async () => {
    await open("/pvp/match/a9");
    expect(await screen.findByText("This match is not recorded on this device.", {}, WAIT)).toBeInTheDocument();
  });
});
