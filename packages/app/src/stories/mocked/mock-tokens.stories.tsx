import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domMax } from "motion/react";
import { Toaster } from "sonner";
import { expect, waitFor } from "storybook/test";
import { DEVICE_KEY, FakeGameViews, IndexerClient, localKey, type EconomyViews, type KeyStorage } from "@paved/chain";
import { seededRandom } from "@paved/renderer";
import { BalancesSlot } from "../../components/containers/balances-context";
import { MockMarkProvider } from "../../components/containers/mock-mark";
import { PHONE_320, PHONE_375, WIDE_1440 } from "../../components/scenes/viewports";
import type { DataSources, GameSigner } from "../../data/sources";
import { MOCK_STARTING_BALANCES, MockLedger, type TokenBalances } from "../../data/mock/ledger";
import { mockConnector, mockEconomyViews, mockGameViews } from "../../data/mock/overlay";
import { PAVED_BALANCE } from "../../mocks/economy";
import { NEW_PLAYER_SEED } from "../../mocks/new-player";
import { BalancesHost } from "../../routes/balances-host";
import { mockKeyConnector } from "../../wallet/mock-key";
import { WalletProvider, type LoadConnector } from "../../wallet/wallet";

/**
 * The tokens on the mock (#927, PR 3): USDC, PAVED and the Vault's vPAVED kept in the device's ledger, read from no node. The
 * shell's balances (`BalancesHost`) as the app wires them, over the mock's wallet and the ledger's economy views: a new account
 * holds the faucet's 100 USDC and no PAVED, and "Get test USDC" (the ledger's `mint`) is always there and adds 100 more.
 */
const meta = { title: "Pages/Mock tokens", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A device's key, fixed so the stories' account is the same at every load. */
const DEVICE_PRIVATE_KEY = "0x2dccce1da22003777062ee0870e9881b460a8b7eca276870f57c601f182136c";
const ACCOUNT = localKey(DEVICE_PRIVATE_KEY).address;
const P = 10n ** 18n;

/** What the ledger holds before the story: a new account's, or a player who won PAVED and put 100 of it in the Vault. */
type Holding = "new" | "holder";

function environment(holding: Holding, latencyMs: number) {
  const items = new Map([[DEVICE_KEY, DEVICE_PRIVATE_KEY]]);
  const storage: KeyStorage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  const starting: TokenBalances = holding === "holder" ? { ...MOCK_STARTING_BALANCES, paved: PAVED_BALANCE } : MOCK_STARTING_BALANCES;
  const ledger = new MockLedger({ store: () => null, seller: "0x3", latencyMs, starting });
  // The ledger answers every read the balances make (the tokens, the Vault, the Cobbles): no chain under its overlays.
  const economy = mockEconomyViews({} as EconomyViews, ledger);
  const views = mockGameViews(new FakeGameViews(), ledger);
  const indexer = new IndexerClient({ url: "http://indexer.invalid/", fetch: (() => Promise.reject(new Error("No indexer in this story"))) as typeof fetch });
  const sources: DataSources = { views, events: { playerGames: async () => [] }, economy, pool: null, indexer, signer: null };
  const keys = mockKeyConnector({ storage, ledger, signer: (from) => ({ address: from.address }) as unknown as GameSigner });
  const load: LoadConnector = async () => {
    if (holding === "holder") await ledger.deposit(ACCOUNT, 100n * P, { confirmedAmount: 100n * P });
    return mockConnector(keys, ledger, { random: seededRandom(NEW_PLAYER_SEED) });
  };
  return { sources, load, client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
}

function TokensPage({ holding = "new", latencyMs = 300 }: { holding?: Holding; latencyMs?: number }) {
  const [env] = useState(() => environment(holding, latencyMs));
  return (
    <QueryClientProvider client={env.client}>
      <WalletProvider sources={env.sources} load={env.load}>
        <MockMarkProvider value>
          <LazyMotion features={domMax}>
            {/* The mock's faucet: always there on a mock build (#927), which Storybook's is not. */}
            <BalancesHost page={null} faucet>
              <div className="flex flex-col items-start gap-6 p-4">
                <BalancesSlot layout="pill" kinds={["usdc", "paved", "vpaved", "cobbles"]} className="flex-wrap wide:hidden" />
                <BalancesSlot layout="rail" kinds={["usdc", "paved", "vpaved", "cobbles"]} className="hidden flex-wrap wide:flex" />
              </div>
            </BalancesHost>
            <Toaster />
          </LazyMotion>
        </MockMarkProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}

/** A story pinned to a viewport (the viewport's `parameters` merged into the story's). */
function at(story: Story, viewport: { parameters?: Story["parameters"]; globals: Story["globals"] }): Story {
  return { ...story, parameters: { ...story.parameters, ...viewport.parameters }, globals: viewport.globals };
}

/** The USDC plate's accessible name, with its action. */
const USDC_PLATE = /USDC: (Get test USDC|Minting…)$/;

/** A new account on the mock: the faucet's 100 USDC, no PAVED, no vPAVED, no Cobbles, and "Get test USDC". */
export const NewAccount: Story = {
  render: () => <TokensPage />,
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "100.00 USDC: Get test USDC" }, { timeout: 10_000 });
    await canvas.findByRole("button", { name: /^0(\.00)? PAVED/ });
  },
};
export const NewAccountPhone320: Story = at(NewAccount, PHONE_320);
export const NewAccountPhone375: Story = at(NewAccount, PHONE_375);
export const NewAccountWide1440: Story = at(NewAccount, WIDE_1440);

/** "Get test USDC" pressed: the mint on its way (a long one here), the plate says so and takes no second press. */
export const Minting: Story = {
  render: () => <TokensPage latencyMs={600_000} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "100.00 USDC: Get test USDC" }, { timeout: 10_000 }));
    await waitFor(() => expect(canvas.getByRole("button", { name: USDC_PLATE })).toBeDisabled(), { timeout: 10_000 });
  },
};
export const MintingPhone320: Story = at(Minting, PHONE_320);

/** After "Get test USDC": 100 more from the ledger's faucet, 200 USDC, and the action there again. */
export const AfterMint: Story = {
  render: () => <TokensPage />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "100.00 USDC: Get test USDC" }, { timeout: 10_000 }));
    await canvas.findByRole("button", { name: "200.00 USDC: Get test USDC" }, { timeout: 10_000 });
  },
};
export const AfterMintPhone320: Story = at(AfterMint, PHONE_320);
export const AfterMintWide1440: Story = at(AfterMint, WIDE_1440);

/** A player who won 142.35 PAVED and deposited 100 of it: 42.35 PAVED in the wallet and the vPAVED the Vault gave, both the ledger's. */
export const VaultHolder: Story = {
  render: () => <TokensPage holding="holder" />,
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: /^42\.35 PAVED/ }, { timeout: 10_000 });
  },
};
export const VaultHolderPhone320: Story = at(VaultHolder, PHONE_320);
export const VaultHolderWide1440: Story = at(VaultHolder, WIDE_1440);
