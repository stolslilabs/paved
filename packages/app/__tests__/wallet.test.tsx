import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDataSources } from "../src/data";
import { WalletFooter } from "../src/wallet/notice";
import { WalletProvider, useAccount, useWallet } from "../src/wallet/wallet";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";

/** What a page reads: the wallet's state and the data hooks' signer. */
function Probe() {
  const wallet = useWallet();
  const { signer = null } = useDataSources();
  return (
    <div>
      <span data-testid="status">{wallet.status}</span>
      <span data-testid="signer">{signer ? signer.address : "none"}</span>
      <button type="button" onClick={() => void wallet.connect()}>
        connect
      </button>
      <button type="button" onClick={wallet.disconnect}>
        disconnect
      </button>
      <WalletFooter />
    </div>
  );
}

function RestoringProbe() {
  useAccount();
  return <Probe />;
}

const signerOf = () => screen.getByTestId("signer").textContent;

describe("the wallet (P6)", () => {
  it("connect fills the sources' signer with the account's writes; disconnect clears it", async () => {
    const wallet = fakeWallet({ address: "0x5f1" });
    render(
      <WalletProvider sources={fakeSources().sources} load={wallet.load}>
        <Probe />
      </WalletProvider>,
    );
    expect(signerOf()).toBe("none");
    // Nothing is loaded or probed before a page asks.
    expect(wallet.calls).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() => expect(signerOf()).toBe("0x5f1"));
    expect(screen.getByTestId("status").textContent).toBe("connected");
    expect(screen.getByText(/Connected as/)).toHaveTextContent("0x5f1");

    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(signerOf()).toBe("none");
    expect(screen.getByTestId("status").textContent).toBe("disconnected");
    await waitFor(() => expect(wallet.calls).toEqual(["connect", "disconnect"]));
  });

  it("a refused connect leaves no signer and says why", async () => {
    const wallet = fakeWallet({ refuse: "the player closed the window" });
    render(
      <WalletProvider sources={fakeSources().sources} load={wallet.load}>
        <Probe />
      </WalletProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "connect" }));
    expect(await screen.findByText("Not connected: the player closed the window")).toBeInTheDocument();
    expect(signerOf()).toBe("none");
  });

  it("a session approved earlier comes back on a page that reads the account, without a prompt", async () => {
    const wallet = fakeWallet({ address: "0xabc", restored: true });
    render(
      <WalletProvider sources={fakeSources().sources} load={wallet.load}>
        <RestoringProbe />
      </WalletProvider>,
    );
    await waitFor(() => expect(signerOf()).toBe("0xabc"));
    expect(wallet.calls).toEqual(["probe"]);
  });

  it("a connector that cannot load (no deployment) leaves a guest, and says why only when the player asked", async () => {
    const load = () => Promise.reject(new Error("Not connected: Challenge missing"));
    render(
      <WalletProvider sources={fakeSources().sources} load={load}>
        <RestoringProbe />
      </WalletProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("disconnected"));
    expect(screen.queryByText(/Challenge missing/)).toBeNull();
    await act(async () => void (await userEvent.click(screen.getByRole("button", { name: "connect" }))));
    expect(await screen.findByText(/Challenge missing/)).toBeInTheDocument();
    expect(signerOf()).toBe("none");
  });

  it("the footer carries the D-15 notice, linked to the notices file", () => {
    render(
      <WalletProvider sources={fakeSources().sources} load={fakeWallet().load}>
        <WalletFooter />
      </WalletProvider>,
    );
    expect(screen.getByText(/Uses Cartridge Controller, © Cartridge Gaming Company/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Third-party notices" })).toHaveAttribute("href", "/THIRD_PARTY_NOTICES.txt");
  });
});
