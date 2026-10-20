import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Balances, type BalancesState } from "../src/components/containers/balances";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { TopBar } from "../src/components/containers/top-bar";
import { ResourcePlate } from "../src/components/elements/resource-plate";
import { HomeScene } from "../src/components/scenes/home-scene";
import { HOME } from "../src/mocks/scenes";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const READY: BalancesState = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 };

describe("Balances (#538), the resource bar (#620)", () => {
  it("pill: the Cobbles and USDC plates; a tap on USDC opens every balance with its action", async () => {
    const onAction = vi.fn();
    render(wrap(<Balances layout="pill" state={READY} onAction={onAction} />));
    expect(screen.getByRole("button", { name: "240 Cobbles: Buy packs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Balances" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("48.50")).toBeInTheDocument();
    expect(within(sheet).getByText("142.35")).toBeInTheDocument();
    // vPAVED shows only when held.
    expect(within(sheet).queryByRole("button", { name: "vPAVED: Vault" })).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "PAVED: Vault" }));
    expect(onAction).toHaveBeenCalledWith("paved");
  });

  it("pill: the Cobbles' plate leads to the packs", async () => {
    const onAction = vi.fn();
    render(wrap(<Balances layout="pill" state={READY} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "240 Cobbles: Buy packs" }));
    expect(onAction).toHaveBeenCalledWith("cobbles");
  });

  it("pill: Escape closes the sheet and the focus returns to the USDC plate", async () => {
    render(wrap(<Balances layout="pill" state={READY} />));
    const pill = screen.getByRole("button", { name: "Balances" });
    pill.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(pill).toHaveFocus());
  });

  it("pill: a guest's tap connects", async () => {
    const onConnect = vi.fn();
    render(wrap(<Balances layout="pill" state={{ status: "disconnected" }} onConnect={onConnect} />));
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("rail: a plate per balance, each leading to its place; the Cobbles' plate to the packs", async () => {
    const onAction = vi.fn();
    render(wrap(<Balances layout="rail" state={READY} onAction={onAction} faucet />));
    await userEvent.click(screen.getByRole("button", { name: "240 Cobbles: Buy packs" }));
    expect(onAction).toHaveBeenCalledWith("cobbles");
    await userEvent.click(screen.getByRole("button", { name: "48.50 USDC: Get test USDC" }));
    expect(onAction).toHaveBeenCalledWith("usdc");
    await userEvent.click(screen.getByRole("button", { name: "142.35 PAVED: Vault" }));
    expect(onAction).toHaveBeenCalledWith("paved");
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("rail: vPAVED joins when held, and leads to the Vault", async () => {
    const onAction = vi.fn();
    const { rerender } = render(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 0n }} onAction={onAction} />));
    expect(screen.queryByRole("button", { name: /vPAVED/ })).toBeNull();
    rerender(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 1_250_400_000_000_000_000n }} onAction={onAction} />));
    await userEvent.click(screen.getByRole("button", { name: "1.25 vPAVED: Vault" }));
    expect(onAction).toHaveBeenCalledWith("vpaved");
  });

  it("each token shows its icon file, no Font Awesome glyph", () => {
    const { container } = render(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 1n }} />));
    expect([...container.querySelectorAll("img[data-slot=token-icon]")].map((i) => i.getAttribute("data-token"))).toEqual(["usdc", "paved", "vpaved", "cobbles"]);
    expect(container.querySelector("[data-icon=wallet], [data-icon=piggy-bank], [data-icon=cubes-stacked], .fa-wallet, .fa-piggy-bank, .fa-cubes-stacked")).toBeNull();
  });

  it("rail: without a faucet USDC has no action; while minting it is busy", () => {
    const { rerender } = render(wrap(<Balances layout="rail" state={READY} />));
    expect(screen.getByRole("button", { name: "48.50 USDC" })).toBeDisabled();
    rerender(wrap(<Balances layout="rail" state={READY} faucet minting />));
    expect(screen.getByRole("button", { name: "48.50 USDC: Minting…" })).toBeDisabled();
  });

  it("a balance with no source is a dash", () => {
    render(wrap(<Balances layout="rail" state={{ ...READY, paved: null }} />));
    expect(screen.getByRole("button", { name: "PAVED unavailable: Vault" })).toHaveTextContent("–");
  });

  it("an error is inline, not a toast", () => {
    render(wrap(<Balances layout="rail" state={{ status: "error", message: "RPC down" }} />));
    expect(screen.getByRole("alert")).toHaveTextContent("RPC down");
  });

  it("rail: the slot lays out the rail even when its value says pill (stories' bug)", async () => {
    render(wrap(<BalancesProvider value={{ state: READY, faucet: true }}><HomeScene {...HOME.connected} /></BalancesProvider>));
    expect(await screen.findAllByRole("region", { name: "Balances" })).toHaveLength(2);
  });

  it("a page's header carries the pill through the shell's provider, and none without it", async () => {
    const { unmount } = render(wrap(<HomeScene {...HOME.connected} />));
    expect(screen.queryByRole("button", { name: "Balances" })).toBeNull();
    unmount();
    render(wrap(<BalancesProvider value={{ state: READY }}><HomeScene {...HOME.connected} /></BalancesProvider>));
    expect(await screen.findByRole("button", { name: "Balances" })).toBeInTheDocument();
  });

  it("a flow's top bar carries the balances too: the strip on a phone, the rail from desktop", async () => {
    const { unmount } = render(wrap(<TopBar title="Choose a mode" />));
    expect(screen.queryByRole("region", { name: "Balances" })).toBeNull();
    unmount();
    render(wrap(<BalancesProvider value={{ state: READY }}><TopBar title="Choose a mode" /></BalancesProvider>));
    const regions = await screen.findAllByRole("region", { name: "Balances" });
    expect(regions).toHaveLength(2);
    expect(regions.map((r) => r.parentElement!.className.includes("desktop:hidden") || r.className.includes("desktop:flex"))).toEqual([true, true]);
  });
});

describe("ResourcePlate: the change animations (#620)", () => {
  const plate = (amount: bigint | null, reduced: "never" | "always" = "never") =>
    wrap(
      <MotionConfig reducedMotion={reduced}>
        <ResourcePlate kind="cobbles" amount={amount} decimals={0} fraction={0} />
      </MotionConfig>,
    );
  // The newest change: the one before may still be leaving (`AnimatePresence`).
  const change = (c: HTMLElement) => [...c.querySelectorAll("[data-slot=resource-change]")].at(-1) ?? null;

  it("nothing moves on the first load", () => {
    const { container } = render(plate(240n));
    expect(change(container)).toBeNull();
    expect(container).toHaveTextContent("240");
  });

  it("up: a +N rises; down: a −N drops", () => {
    const { container, rerender } = render(plate(240n));
    rerender(plate(340n));
    expect(change(container)).toHaveTextContent("+100");
    expect(change(container)!.className).toContain("text-success");
    rerender(plate(290n));
    expect(change(container)).toHaveTextContent("−50");
    expect(change(container)!.className).toContain("text-warning");
  });

  it("never from a missing value: a value that arrives after none is a first load", () => {
    const { container, rerender } = render(plate(null));
    expect(container).toHaveTextContent("–");
    rerender(plate(240n));
    expect(change(container)).toBeNull();
  });

  it("under reduced motion the figure only flashes its colour: no floating change", () => {
    const { container, rerender } = render(plate(240n, "always"));
    rerender(plate(340n, "always"));
    expect(change(container)).toBeNull();
    expect(container.querySelector(".text-success")).not.toBeNull();
  });
});
