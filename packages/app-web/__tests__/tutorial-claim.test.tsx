// @vitest-environment jsdom
// U2: the tutorial's claim (D-21, P-49) on its chain route, `/tutorial/claim`, with the writer mocked. One
// `Setup.claim_tutorial()` per press; its receipt says claimed (Setup's AchievementProgressed of task 10) or already
// claimed (no event: the call is idempotent).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { WriteError } from "@paved/chain";
import type { Deployment, WriteResult } from "@paved/chain";
import { TutorialClaimPage, claimOutcome } from "../src/tutorial/TutorialClaim";
import { configured, notConfigured, renderPage } from "./helpers/page-fixtures";

const wallet = vi.hoisted(() => ({ current: null as null | { signer: string; connecting: boolean; error: string | null; connect: () => void } }));
vi.mock("../src/components/WalletProvider", () => ({ useWallet: () => wallet.current }));

afterEach(() => {
  cleanup();
  wallet.current = null;
});

const CLAIMED: WriteResult = {
  transactionHash: "0xc1",
  events: [{ name: "AchievementProgressed", fields: { playerId: "0xabc", taskId: 10, count: 1 }, fromAddress: "0x3" }],
};
const ALREADY: WriteResult = { transactionHash: "0xc2", events: [] };

function claimPage(opts: { claimTutorial?: ReturnType<typeof vi.fn>; account?: null; deployment?: Deployment } = {}) {
  const claimTutorial = opts.claimTutorial ?? vi.fn(async () => CLAIMED);
  renderPage({ page: <TutorialClaimPage />, path: "/tutorial/claim", writer: { claimTutorial }, account: opts.account, deployment: opts.deployment });
  return { claimTutorial };
}

describe("claimOutcome: the receipt tells a claim from a repeat", () => {
  it("Setup's AchievementProgressed of task 10 is a claim; no event is a claim made before", () => {
    expect(claimOutcome(CLAIMED)).toBe("claimed");
    expect(claimOutcome(ALREADY)).toBe("already-claimed");
    // Another task's progress is not the tutorial's.
    expect(claimOutcome({ transactionHash: "0x1", events: [{ name: "AchievementProgressed", fields: { taskId: 1, count: 1 } }] })).toBe("already-claimed");
  });
});

describe("Tutorial claim page", () => {
  it("claimed: one claim_tutorial() on the press, then First Stone is the player's", async () => {
    const { claimTutorial } = claimPage();
    expect(claimTutorial).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("claim-button"));
    expect((await screen.findByTestId("claim-claimed")).textContent).toBe("Claimed: First Stone is yours.");
    expect(claimTutorial).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("claim-button")).toBeNull();
  });

  it("already claimed: said plainly, the call is idempotent and changed nothing", async () => {
    claimPage({ claimTutorial: vi.fn(async () => ALREADY) });
    fireEvent.click(screen.getByTestId("claim-button"));
    const text = (await screen.findByTestId("claim-already")).textContent!;
    expect(text).toMatch(/^Already claimed/);
    expect(text).toMatch(/counts once, so this one changed nothing/);
  });

  it("a double press while the claim is in flight sends one call", async () => {
    let finish!: (r: WriteResult) => void;
    const { claimTutorial } = claimPage({ claimTutorial: vi.fn(() => new Promise<WriteResult>((r) => (finish = r))) });
    const button = screen.getByTestId("claim-button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByTestId("claim-button").textContent).toBe("Claiming...");
    expect((screen.getByTestId("claim-button") as HTMLButtonElement).disabled).toBe(true);
    finish(CLAIMED);
    await screen.findByTestId("claim-claimed");
    expect(claimTutorial).toHaveBeenCalledTimes(1);
  });

  it("refused: the reason, and the claim may be tried again", async () => {
    const claimTutorial = vi.fn().mockRejectedValueOnce(new WriteError("Transaction reverted", "0xbad", true)).mockResolvedValueOnce(CLAIMED);
    claimPage({ claimTutorial });
    fireEvent.click(screen.getByTestId("claim-button"));
    expect((await screen.findByTestId("claim-refused")).textContent).toBe("The claim was refused: Transaction reverted");
    fireEvent.click(screen.getByTestId("claim-button"));
    await screen.findByTestId("claim-claimed");
    expect(claimTutorial).toHaveBeenCalledTimes(2);
  });

  it("no wallet: says so, sends nothing, and offers the controller's Connect", async () => {
    const connect = vi.fn();
    wallet.current = { signer: "controller", connecting: false, error: null, connect };
    const { claimTutorial } = claimPage({ account: null });
    expect(screen.getByTestId("claim-no-wallet").textContent).toMatch(/No wallet is connected/);
    expect(screen.queryByTestId("claim-button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(claimTutorial).not.toHaveBeenCalled();
  });

  it("no wallet and no controller (a devnet without a burner): no Connect button", () => {
    claimPage({ account: null });
    expect(screen.getByTestId("claim-no-wallet")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("no Setup in the deployment, or no deployment: unavailable, nothing to press", async () => {
    const before = { ...configured, addresses: { ...configured.addresses, Setup: "" } } as Deployment;
    const { claimTutorial } = claimPage({ deployment: before });
    expect(screen.getByTestId("claim-unavailable").textContent).toMatch(/no Setup contract/);
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    claimPage({ deployment: notConfigured });
    await waitFor(() => expect(screen.getByTestId("claim-unavailable")).toBeTruthy());
    expect(claimTutorial).not.toHaveBeenCalled();
  });
});
