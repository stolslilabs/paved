import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { expect, waitFor } from "storybook/test";
import { DEVICE_KEY, DEVICE_KEY_SIGNED_OUT, FakeGameViews, IndexerClient, type KeyStorage } from "@paved/chain";
import { seededRandom } from "@paved/renderer";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../../components/scenes/viewports";
import type { DataSources, GameSigner } from "../../data/sources";
import { MockLedger } from "../../data/mock/ledger";
import { mockConnector, mockGameViews } from "../../data/mock/overlay";
import { NEW_PLAYER_SEED } from "../../mocks/new-player";
import SettingsPageRoute from "../../routes/pages/settings";
import { mockKeyConnector } from "../../wallet/mock-key";
import { WalletProvider, type LoadConnector } from "../../wallet/wallet";

/**
 * The mock's wallet (#927, PR 2): the device's key in its storage and its account the ledger's, deployed nowhere and read from no
 * node (`wallet/mock-key.ts`), under the app's mock overlay (`mockConnector`: the village founded and the name and look drawn at
 * the connection). Settings as the app wires it, over a key kept in memory: Connect, Disconnect and Reset work here as in the app.
 */
const meta = { title: "Pages/Settings mock wallet", parameters: { layout: "fullscreen", route: "/settings" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A device's key, fixed so the stories' account (and so its drawn name and look) are the same at every load. */
const DEVICE_PRIVATE_KEY = "0x2dccce1da22003777062ee0870e9881b460a8b7eca276870f57c601f182136c";

function memoryStorage(initial: Record<string, string>): KeyStorage {
  const items = new Map(Object.entries(initial));
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
}

/** The key's state on the device: none (a new browser), kept and connected, or kept while disconnected. */
type Device = "new" | "kept" | "signed-out";

function environment(device: Device) {
  const storage = memoryStorage(device === "new" ? {} : { [DEVICE_KEY]: DEVICE_PRIVATE_KEY, ...(device === "signed-out" ? { [DEVICE_KEY_SIGNED_OUT]: "1" } : {}) });
  const ledger = new MockLedger({ store: () => null, seller: "0x3", latencyMs: 600 });
  const views = mockGameViews(new FakeGameViews(), ledger);
  const indexer = new IndexerClient({ url: "http://indexer.invalid/", fetch: (() => Promise.reject(new Error("No indexer in this story"))) as typeof fetch });
  const sources: DataSources = { views, events: { playerGames: async () => [] }, economy: null, pool: null, indexer, signer: null };
  // The new players' names and looks from the stories' seed (#926): the same at every load.
  const random = seededRandom(NEW_PLAYER_SEED);
  const keys = mockKeyConnector({ storage, ledger, signer: (from) => ({ address: from.address }) as unknown as GameSigner });
  const load: LoadConnector = async () => mockConnector(keys, ledger, { random });
  return { sources, load, client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
}

function SettingsPage({ device }: { device: Device }) {
  const [env] = useState(() => environment(device));
  return (
    <QueryClientProvider client={env.client}>
      <WalletProvider sources={env.sources} load={env.load}>
        <MockMarkProvider value>
          <LazyMotion features={domMax}>
            <Routes>
              <Route path="/settings" element={<SettingsPageRoute />} />
              <Route path="*" element={<p className="p-4 text-sm">Left Settings.</p>} />
            </Routes>
            <Toaster />
          </LazyMotion>
        </MockMarkProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

/** A story pinned to a viewport, its route kept (the viewport's `parameters` would replace the story's). */
function at(story: Story, viewport: { parameters?: Story["parameters"]; globals: Story["globals"] }): Story {
  return { ...story, parameters: { ...story.parameters, ...viewport.parameters }, globals: viewport.globals };
}

/** The device's key kept: a reload finds its account with no prompt, named and dressed by the ledger, with Disconnect and Reset. */
export const Connected: Story = {
  render: () => <SettingsPage device="kept" />,
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Disconnect" }, { timeout: 10_000 });
  },
};
export const ConnectedPhone320: Story = at(Connected, PHONE_320);
export const ConnectedPhone375: Story = at(Connected, PHONE_375);
export const ConnectedWide1440: Story = at(Connected, WIDE_1440);

/** A new browser: no key yet, a guest with Connect; Connect makes the key and its ledger account, founded and named. */
export const NewDevice: Story = { render: () => <SettingsPage device="new" /> };
export const NewDevicePhone320: Story = at(NewDevice, PHONE_320);

/** Disconnected: the key kept, no reconnect on a reload until Connect, which finds the same account. */
export const Disconnected: Story = { render: () => <SettingsPage device="signed-out" /> };
export const DisconnectedPhone320: Story = at(Disconnected, PHONE_320);

/** Reset: the key and its ledger account forgotten, a new account connected with its own name and look. */
export const AfterReset: Story = {
  render: () => <SettingsPage device="kept" />,
  play: async ({ canvas, userEvent }) => {
    /** The account row's text: the name, Connected and the short address. */
    const row = async () => (await canvas.findByRole("button", { name: "Disconnect" }, { timeout: 10_000 })).parentElement?.textContent ?? "";
    const before = await row();
    await userEvent.click(await canvas.findByRole("button", { name: "Reset" }));
    // Connected again, with the new account's name and address in the row.
    await waitFor(async () => expect(await row()).not.toBe(before), { timeout: 10_000 });
    await waitFor(() => expect(canvas.getByRole("button", { name: "Reset" })).toBeEnabled(), { timeout: 10_000 });
  },
};
export const AfterResetPhone320: Story = at(AfterReset, PHONE_320);
