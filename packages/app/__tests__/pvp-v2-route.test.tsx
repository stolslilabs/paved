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
// marks at 80 / 90 / 100 %; the last tile ends it and the page goes back to the league.

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
  await Promise.all([import("../src/routes/pages/pvp"), import("../src/routes/pvp-v2"), import("../src/routes/pages/pvp-league")]);
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
    expect(card.querySelector("[data-deck]")).toHaveTextContent(`${attackDeckSize(rival.slots)} tiles to play${rival.slots} slots, on an open board`);
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

  it("resumes an open attack, and its last tile ends it: the stars told, back to the league", async () => {
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
    expect(await screen.findByText("0 stars", {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "League" }, WAIT)).toBeInTheDocument();
    expect((await s.ledger.attackV2(s.me)).attack!.status).toBe("finished");
  });
});
