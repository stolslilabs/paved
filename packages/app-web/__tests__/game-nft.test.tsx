// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { FakeCollectionViews, FakeGameViews, IndexerClient } from "@paved/chain";
import type { Deployment } from "@paved/chain";
import { FIXTURE_ADA, FixtureIndexer } from "@paved/chain/testing";
import { NftViewsProvider } from "../src/components/GameNft";
import { GamePage } from "../src/pages/Game";
import { PlayerPage } from "../src/pages/Player";
import { configured, fakeGame, gameKey, renderPage } from "./helpers/page-fixtures";

vi.mock("@paved/renderer/react", () => ({ GameCanvas: () => null }));
vi.mock("@paved/ui", async () => {
  const { makeUiMock } = await import("./helpers/page-fixtures");
  return {
    ...makeUiMock(),
    IngameStatus: () => null,
    GameCompleteDialog: () => null,
    SpotSelector: () => null,
    ActionBar: () => null,
  };
});

configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

const COLLECTION = "0x04d1328dbe2c9441a5b7f1fca8da91e94bfd7de2bdc7550dbd989f7af72f99ef";
const SHORT = "0x04d1…99ef";
const withCollection = { ...configured, collection: "0x077777777777777777777" } as Deployment;
const dataUri = (json: unknown) => `data:application/json;base64,${Buffer.from(JSON.stringify(json)).toString("base64")}`;
const GAME_JSON = { name: "Paved Games #912", description: "A game of Paved.", attributes: [{ trait_type: "Score", value: 187 }, { trait_type: "Over", value: true }] };

let fixture: FixtureIndexer;
let indexer: IndexerClient;
let collection: FakeCollectionViews;
beforeEach(() => {
  fixture = new FixtureIndexer();
  indexer = new IndexerClient({ url: "http://indexer.test", fetch: fixture.fetch as typeof fetch });
  collection = new FakeCollectionViews();
  collection.uris.set("912", dataUri(GAME_JSON));
  for (const id of ["4", "4294967300"]) collection.owners.set(id, "0xabc");
});

const player = (opts: Partial<Parameters<typeof renderPage>[0]> = {}) =>
  renderPage({
    page: <PlayerPage />,
    path: `/player/${FIXTURE_ADA}`,
    route: "/player/:playerId",
    indexer,
    wrap: (routes) => <NftViewsProvider views={collection}>{routes}</NftViewsProvider>,
    ...opts,
  });

describe("Player page: the games' NFTs", () => {
  it("the indexer's Collection and the rows' token ids: one NFT line per game, Tutorial ids past 2^32", async () => {
    fixture.state.collection = COLLECTION;
    player();
    const lines = await screen.findAllByTestId("game-nft");
    expect(lines.map((l) => l.textContent)).toEqual([`NFT: ${SHORT} #912Metadata`, `NFT: ${SHORT} #4294967351Metadata`]);
    expect(screen.getByRole("columnheader", { name: "NFT" })).toBeTruthy();
  });

  it("no indexer Collection: the deployments file's, shown with its own address", async () => {
    fixture.state.collection = null;
    player({ deployment: withCollection });
    const lines = await screen.findAllByTestId("game-nft");
    expect(lines[0].textContent).toContain("NFT: 0x0777…7777 #912");
  });

  it("no Collection anywhere: no NFT line, no NFT column, no error", async () => {
    player({ deployment: configured });
    await screen.findByText("#912");
    expect(screen.queryByTestId("game-nft")).toBeNull();
    expect(screen.queryByText(/NFT/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rows without token_id (an older indexer) or with a null one show no NFT line", async () => {
    fixture.state.collection = COLLECTION;
    fixture.games = fixture.games.map((g, i) => (i === 0 ? { ...g, token_id: null } : (({ token_id: _t, ...rest }) => rest)(g)));
    player();
    await screen.findByText("#912");
    await screen.findByRole("columnheader", { name: "NFT" });
    expect(screen.queryByTestId("game-nft")).toBeNull();
    expect(screen.queryByText(/#4294967351/)).toBeNull();
  });

  it("the Metadata toggle reads token_uri once opened and shows name, description and attributes as text", async () => {
    fixture.state.collection = COLLECTION;
    player();
    const [first] = await screen.findAllByTestId("game-nft");
    expect(collection.calls).toEqual([]);
    fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
    const panel = await within(first).findByTestId("nft-metadata");
    expect(collection.calls).toEqual(["token_uri 912"]);
    expect(within(panel).getByText("Paved Games #912")).toBeTruthy();
    expect(within(panel).getByText("A game of Paved.")).toBeTruthy();
    expect(within(panel).getByText("Score").nextElementSibling!.textContent).toBe("187");
    expect(within(panel).getByText("Over").nextElementSibling!.textContent).toBe("true");
    // Closed again: the panel goes.
    fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
    expect(within(first).queryByTestId("nft-metadata")).toBeNull();
  });

  it("a hostile JSON string is text: no element, no script, no handler is created from it", async () => {
    fixture.state.collection = COLLECTION;
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
    collection.uris.set(
      "912",
      dataUri({ name: evil, description: "<a href='javascript:window.__pwned=3'>x</a>", attributes: [{ trait_type: "<b>t</b>", value: "<svg onload=window.__pwned=4>" }] }),
    );
    const { container } = player();
    const [first] = await screen.findAllByTestId("game-nft");
    fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
    const panel = await within(first).findByTestId("nft-metadata");
    await waitFor(() => expect(panel.textContent).toContain(evil));
    expect(panel.textContent).toContain("<a href='javascript:window.__pwned=3'>x</a>");
    expect(panel.textContent).toContain("<b>t</b>");
    expect(panel.textContent).toContain("<svg onload=window.__pwned=4>");
    expect(container.querySelector("img, script, svg, b")).toBeNull();
    expect(panel.querySelector("a[href^='javascript:']")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("a token_uri that is not a data:application/json URI is unreadable, never fetched or injected", async () => {
    fixture.state.collection = COLLECTION;
    collection.uris.set("912", "https://example.com/912.json");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    player();
    const [first] = await screen.findAllByTestId("game-nft");
    fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
    expect((await within(first).findByRole("alert")).textContent).toBe("Metadata unreadable: token_uri is not a data:application/json URI");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("a failed token_uri read says so and can be retried", async () => {
    fixture.state.collection = COLLECTION;
    collection.uris.delete("912");
    player();
    const [first] = await screen.findAllByTestId("game-nft");
    fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
    await within(first).findByText(/Metadata unavailable/);
    collection.uris.set("912", dataUri(GAME_JSON));
    fireEvent.click(within(first).getByRole("button", { name: "Retry" }));
    await within(first).findByText("Paved Games #912");
  });

  it("a raw JSON link is a blob URL of application/json, revoked when the panel closes", async () => {
    fixture.state.collection = COLLECTION;
    const created: Blob[] = [];
    const revoked: string[] = [];
    const url = globalThis.URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const before = { c: url.createObjectURL, r: url.revokeObjectURL };
    url.createObjectURL = (b: Blob) => (created.push(b), "blob:test/1");
    url.revokeObjectURL = (u: string) => revoked.push(u);
    try {
      player();
      const [first] = await screen.findAllByTestId("game-nft");
      fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
      const link = await within(first).findByRole("link", { name: "Raw JSON" });
      expect(link.getAttribute("href")).toBe("blob:test/1");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(created).toHaveLength(1);
      expect(created[0].type).toBe("application/json");
      expect(JSON.parse(await created[0].text())).toEqual(GAME_JSON);
      fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
      expect(revoked).toEqual(["blob:test/1"]);
    } finally {
      url.createObjectURL = before.c;
      url.revokeObjectURL = before.r;
    }
  });

  it("without blob URLs in the browser the metadata still shows, with no link", async () => {
    fixture.state.collection = COLLECTION;
    const url = globalThis.URL as unknown as { createObjectURL?: unknown };
    const before = url.createObjectURL;
    url.createObjectURL = undefined;
    try {
      player();
      const [first] = await screen.findAllByTestId("game-nft");
      fireEvent.click(within(first).getByRole("button", { name: "Metadata" }));
      await within(first).findByText("Paved Games #912");
      expect(within(first).queryByRole("link")).toBeNull();
    } finally {
      url.createObjectURL = before;
    }
  });
});

describe("Game page: the game's NFT", () => {
  const open = (search: string, opts: Partial<Parameters<typeof renderPage>[0]> = {}) => {
    const views = new FakeGameViews();
    views.setGame(gameKey, fakeGame());
    views.setGame({ mode: "tutorial", gameId: 4 }, fakeGame());
    return renderPage({
      page: <GamePage />,
      path: "/game",
      search,
      views,
      deployment: withCollection,
      wrap: (routes) => <NftViewsProvider views={collection}>{routes}</NftViewsProvider>,
      ...opts,
    });
  };

  it("a Daily game: its token id is the game id", async () => {
    collection.uris.set("4", dataUri({ ...GAME_JSON, name: "Paved Games #4" }));
    open("?mode=daily&id=4");
    expect((await screen.findByTestId("game-nft")).textContent).toBe("NFT: 0x0777…7777 #4Metadata");
    fireEvent.click(screen.getByRole("button", { name: "Metadata" }));
    await screen.findByText("Paved Games #4");
    expect(collection.calls).toEqual(["owner_of 4", "token_uri 4"]);
  });

  it("a Tutorial game: 2^32 + the game id", async () => {
    open("?mode=tutorial&id=4");
    expect((await screen.findByTestId("game-nft")).textContent).toBe("NFT: 0x0777…7777 #4294967300Metadata");
  });

  it("the indexer's Collection is used when the deployment has none", async () => {
    fixture.state.collection = COLLECTION;
    open("?mode=daily&id=4", { deployment: configured, indexer });
    expect((await screen.findByTestId("game-nft")).textContent).toBe(`NFT: ${SHORT} #4Metadata`);
  });

  it("a Collection with no owner for the id: no line, no Metadata, no error", async () => {
    collection.owners.clear();
    open("?mode=daily&id=4");
    await screen.findByText(/Mode: /);
    await waitFor(() => expect(collection.calls).toEqual(["owner_of 4"]));
    expect(screen.queryByTestId("game-nft")).toBeNull();
    expect(screen.queryByText(/Metadata/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("owner_of is the only call until Metadata is opened, and runs once", async () => {
    open("?mode=daily&id=4");
    await screen.findByTestId("game-nft");
    expect(collection.calls).toEqual(["owner_of 4"]);
  });

  it("the deployment's Collection wins over the indexer's head, which is then not asked", async () => {
    fixture.state.collection = COLLECTION;
    open("?mode=daily&id=4", { indexer });
    expect((await screen.findByTestId("game-nft")).textContent).toBe("NFT: 0x0777…7777 #4Metadata");
    expect(fixture.requests).not.toContain("/v1/head");
  });

  it("no Collection known: no NFT line and no error", async () => {
    open("?mode=daily&id=4", { deployment: configured });
    await screen.findByText(/Mode: /);
    expect(screen.queryByTestId("game-nft")).toBeNull();
    expect(screen.queryByText(/NFT/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
