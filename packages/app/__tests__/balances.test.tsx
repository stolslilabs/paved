import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Balances, type BalancesState } from "../src/components/containers/balances";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { HomeScene } from "../src/components/scenes/home-scene";
import { HOME } from "../src/mocks/scenes";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const READY: BalancesState = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 };

describe("Balances (#538)", () => {
  it("pill: shows the Cobbles, a tap opens the three balances with their actions", async () => {
    const onAction = vi.fn();
    render(wrap(<Balances layout="pill" state={READY} onAction={onAction} />));
    expect(screen.getByRole("img", { name: "240 Cobbles" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Balances" }));
    expect(await screen.findByText("48.50")).toBeInTheDocument();
    expect(screen.getByText("142.35")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "PAVED: Vault" }));
    expect(onAction).toHaveBeenCalledWith("paved");
  });

  it("pill: a guest's tap connects", async () => {
    const onConnect = vi.fn();
    render(wrap(<Balances layout="pill" state={{ status: "disconnected" }} onConnect={onConnect} />));
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("rail: three links to their destinations; Cobble shop for the Cobbles", async () => {
    const onAction = vi.fn();
    render(wrap(<Balances layout="rail" state={READY} onAction={onAction} faucet />));
    await userEvent.click(screen.getByRole("button", { name: "Cobbles: Cobble shop" }));
    expect(onAction).toHaveBeenCalledWith("cobbles");
    await userEvent.click(screen.getByRole("button", { name: "USDC: Get test USDC" }));
    expect(onAction).toHaveBeenCalledWith("usdc");
  });

  it("rail: without a faucet USDC has no action; while minting it is busy", () => {
    const { rerender } = render(wrap(<Balances layout="rail" state={READY} />));
    expect(screen.getByRole("button", { name: "USDC" })).toBeDisabled();
    rerender(wrap(<Balances layout="rail" state={READY} faucet minting />));
    expect(screen.getByRole("button", { name: "USDC: Minting…" })).toBeDisabled();
  });

  it("an error is inline, not a toast", () => {
    render(wrap(<Balances layout="rail" state={{ status: "error", message: "RPC down" }} />));
    expect(screen.getByRole("alert")).toHaveTextContent("RPC down");
  });

  it("rail: the slot lays out the rail even when its value says pill (stories' bug)", async () => {
    render(wrap(<BalancesProvider value={{ state: READY, faucet: true }}><HomeScene {...HOME.connected} /></BalancesProvider>));
    expect(await screen.findByRole("region", { name: "Balances" })).toBeInTheDocument();
  });

  it("a page's header carries the pill through the shell's provider, and none without it", async () => {
    const { unmount } = render(wrap(<HomeScene {...HOME.connected} />));
    expect(screen.queryByRole("button", { name: "Balances" })).toBeNull();
    unmount();
    render(wrap(<BalancesProvider value={{ state: READY }}><HomeScene {...HOME.connected} /></BalancesProvider>));
    expect(await screen.findByRole("button", { name: "Balances" })).toBeInTheDocument();
  });
});
