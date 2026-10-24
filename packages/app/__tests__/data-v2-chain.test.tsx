import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FakeGameViews } from "@paved/chain";
import { FIXTURE_ADA } from "@paved/chain/testing";
import { useAttackV2 } from "../src/data/free-attack";
import { useChests, useFreeVillage, useShop } from "../src/data/free-village";
import { APP_SOURCES } from "../src/routes/sources";
import { fakeSources, renderData } from "./data-fakes";

// PvP v2 on the chain path before step 3 (#741): the app's own views (`APP_SOURCES.views`, the lazy proxy of
// `routes/sources.ts`) over a chain client whose views lack the v2 reads, as `RpcGameViews` does today. The proxy answers
// every name, so the hooks' probes find functions; the read refuses with `not-configured`, and the hooks answer null.

const chain = vi.hoisted(() => ({ views: null as unknown }));
// The chain client itself needs a network: its reads go to `chain.views`, through the module's own `readOf`.
vi.mock("../src/data/chain-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/data/chain-client")>();
  return { ...actual, chainRead: (part: (c: never) => object, key: PropertyKey, args: unknown[]) => actual.readOf(part({ views: chain.views, events: {} } as never), key, args) };
});

describe("PvP v2 through the app's lazy views, on a chain without the v2 reads", () => {
  it("answers null for the village, the chests, the shop and the attack, with no error", async () => {
    chain.views = new FakeGameViews();
    const { sources } = fakeSources({ views: APP_SOURCES.views });
    const { result } = renderData(
      () => ({ village: useFreeVillage(FIXTURE_ADA), chests: useChests(FIXTURE_ADA), shop: useShop(FIXTURE_ADA, 20_750), attack: useAttackV2(FIXTURE_ADA) }),
      sources,
    );
    await waitFor(() => expect(result.current.village).toEqual({ data: null, isPending: false, error: null }));
    await waitFor(() => expect(result.current.chests).toEqual({ data: null, isPending: false, error: null }));
    await waitFor(() => expect(result.current.shop).toEqual({ data: null, isPending: false, error: null }));
    await waitFor(() => expect(result.current.attack).toEqual({ data: null, isPending: false, error: null }));
  });

  it("still calls a read the client has, on the client", async () => {
    const views = new FakeGameViews();
    chain.views = views;
    expect(await (APP_SOURCES.views as FakeGameViews).spawnPaused()).toBe(await views.spawnPaused());
  });
});
