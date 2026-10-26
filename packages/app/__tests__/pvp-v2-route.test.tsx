import { slow } from "../test-slow";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attackDeckSize } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { queryClient } from "../src/lib/query-client";
import { mockRivalV2 } from "../src/data/mock/v2";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { discardTile, placeTile, preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// `/pvp` on PvP v2 (#740) on the mock's rules and ledger (#741): the search draws a rival village, the scout shows the deck
// the attack will have (ceil(1.15 x S)), the attack plays it on an unbounded board with the tile in hand and the next two, its
// marks at 80 / 90 / 100 %; the last tile ends it on its end screen (`/pvp/result/:id`, #790), whose Back goes to the league.

const WAIT = { timeout: slow(8000) };

async function open(path: string, prepare?: (s: ReturnType<typeof mockImplementation>, me: string) => Promise<void>) {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await prepare?.(s, me);
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  render(<App router={createTestRouter(path)} sources={s.sources} connector={wallet.load} />);
  return { ...s, me };
}

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pvp-v2"), import("../src/routes/pages/pvp-league"), import("../src/routes/pages/pvp-result"), import("../src/routes/pvp-v2-end"), import("../src/components/containers/final-board")]);
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
});

describe("/pvp on PvP v2 (#740)", { timeout: slow(30_000) }, () => {
  it("founds the village, searches, scouts the deck, opens the attack on an open board and places a tile", async () => {
    const s = await open("/pvp");
    // A fresh device has no v2 village: the search says so, and Search again founds it with its starter layout.
    expect(await screen.findByText(/Your village is not founded yet/, {}, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Search again/ }));
    expect(await screen.findByRole("heading", { name: "Scout" }, WAIT)).toBeInTheDocument();
    const { match } = await s.ledger.attackV2(s.me);
    const rival = mockRivalV2(match!.opponent)!;
    const card = screen.getByRole("region", { name: "Attack" });
    expect(card.querySelector("[data-deck]")).toHaveTextContent(`${attackDeckSize(rival.slots)} tiles`);
    // The deck chip opens the village's tile list (#788): the rival's tiles, then the extras unknown.
    await userEvent.click(within(card).getByRole("button", { name: /the village's tile list$/ }));
    const sheet = await screen.findByRole("dialog", { name: "Deck" }, WAIT);
    const extras = attackDeckSize(rival.slots) - rival.tiles.length;
    expect(sheet).toHaveTextContent(`${attackDeckSize(rival.slots)} tiles left of ${attackDeckSize(rival.slots)}`);
    expect(within(sheet).getByRole("heading", { name: `The village's tiles ${rival.tiles.length}` })).toBeInTheDocument();
    expect(within(sheet).queryAllByRole("img", { name: "Unknown tile" })).toHaveLength(extras);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Deck" })).toBeNull(), WAIT);
    const points = [80, 90, 100].map((p) => Math.floor((p * rival.score + 99) / 100).toLocaleString("en-US"));
    expect(within(screen.getByRole("list", { name: "Stars" })).getAllByRole("listitem").map((li) => li.textContent?.split("+")[0])).toEqual(points);

    await userEvent.click(within(card).getByRole("button", { name: /^Attack$/ }));
    expect(await screen.findByRole("heading", { name: `Attack: ${rival.name}` }, WAIT)).toBeInTheDocument();
    // The deck counter is the attack's deck; the stack shows the tile in hand and the next two; no territory on the board.
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent(String(attackDeckSize(rival.slots)));
    expect(screen.getByTestId("coming-tiles").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemax", "115");
    expect(document.querySelectorAll("[data-territory]")).toHaveLength(0);
    const slots = await screen.findAllByRole("button", { name: /^Slot / }, WAIT);
    fireEvent.click(slots[0]!);
    await placeTile();
    await waitFor(async () => expect((await s.ledger.attackV2(s.me)).attack!.moves).toHaveLength(1), WAIT);
    await waitFor(() => expect(document.querySelector('[aria-label^="Board of"]')?.getAttribute("aria-label")).toBe("Board of 2 tiles"), WAIT);
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent(String(attackDeckSize(rival.slots) - 1));
  });

  it("resumes an open attack, and its last tile ends it on its end screen; Back goes to the league", async () => {
    const s = await open("/pvp", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      const { attack } = await s.ledger.attackV2(me);
      for (let i = 0; i < attack!.deck - 1; i++) await writes.playAttackV2({ discard: true });
    });
    expect(await screen.findByRole("heading", { name: /^Attack: / }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tiles left/ })).toHaveTextContent("1");
    expect(screen.queryByTestId("coming-tiles")).toBeNull();
    await discardTile();
    expect(await screen.findByRole("heading", { level: 1, name: "Attack over" }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "0 of 3 stars" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Defeat" })).toBeInTheDocument();
    // No star: no chest, and no Open chest.
    expect(screen.queryByRole("region", { name: "Chest" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Open chest/ })).toBeNull();
    expect((await s.ledger.attackV2(s.me)).attack!.status).toBe("finished");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { level: 1, name: "League" }, WAIT)).toBeInTheDocument();
  });

  it("shows a finished attack's end again on a reload of its route: a surrender, said with what it cost", async () => {
    await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      await writes.surrenderAttackV2();
    });
    expect(await screen.findByRole("heading", { name: "Surrendered" }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Attack over" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Crowns" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /League/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "League" }, WAIT)).toBeInTheDocument();
  });

  it("keeps a result's link good after the next attack starts: the attack of that id, not the last", async () => {
    const s = await open("/pvp/result/1", async (s, me) => {
      const writes = s.ledger.writesFor(me);
      await writes.foundFreeVillage();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
      await writes.surrenderAttackV2();
      await writes.drawOpponentV2("search");
      await writes.startAttackV2();
    });
    expect((await s.ledger.attackV2(s.me)).attack).toMatchObject({ id: 2, status: "open" });
    expect(await screen.findByRole("heading", { name: "Surrendered" }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Attack over" })).toBeInTheDocument();
  });
});
