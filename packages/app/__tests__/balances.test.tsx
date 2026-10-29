import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Balances, type BalancesState } from "../src/components/containers/balances";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { TopBar } from "../src/components/containers/top-bar";
import { ResourcePlate } from "../src/components/elements/resource-plate";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const READY: BalancesState = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 };

describe("Balances (#538), the resource bar (#620)", () => {
  it("pill: the Cobbles' plate alone (#720), leading to the packs", async () => {
    const onAction = vi.fn();
    render(wrap(<Balances layout="pill" state={READY} onAction={onAction} />));
    const region = screen.getByRole("region", { name: "Balances" });
    expect(within(region).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("48.50")).toBeNull();
    expect(screen.queryByRole("button", { name: /USDC|PAVED/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "240 Cobbles: Buy packs" }));
    expect(onAction).toHaveBeenCalledWith("cobbles");
  });

  it("pill: an error is a mark that says why, no sheet", () => {
    render(wrap(<Balances layout="pill" state={{ status: "error", message: "RPC down" }} />));
    expect(screen.getByRole("img", { name: "Balances unavailable: RPC down" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
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

  it("vPAVED: a first deposit brings its plate counting up from zero, with its +N", () => {
    const { container, rerender } = render(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 0n }} />));
    rerender(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 500_000_000_000_000_000n }} />));
    expect(screen.getByRole("button", { name: "0.50 vPAVED: Vault" })).toBeInTheDocument();
    expect(container.querySelector("[data-token=vpaved] [data-slot=resource-change]")).toHaveTextContent("+0.50");
  });

  it("vPAVED: a withdrawal to zero counts down and shows its −N before the plate leaves", async () => {
    const { container, rerender } = render(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 500_000_000_000_000_000n }} />));
    rerender(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 0n }} />));
    expect(screen.getByRole("button", { name: "0.00 vPAVED: Vault" })).toBeInTheDocument();
    expect(container.querySelector("[data-token=vpaved] [data-slot=resource-change]")).toHaveTextContent("−0.50");
    await waitFor(() => expect(screen.queryByRole("button", { name: /vPAVED/ })).toBeNull(), { timeout: slow(4000) });
  });

  it("vPAVED: from a missing value it is a first load, no animation", () => {
    const { container, rerender } = render(wrap(<Balances layout="rail" state={{ ...READY, vpaved: undefined }} />));
    rerender(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 500_000_000_000_000_000n }} />));
    expect(screen.getByRole("button", { name: "0.50 vPAVED: Vault" })).toBeInTheDocument();
    expect(container.querySelector("[data-slot=resource-change]")).toBeNull();
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
    render(wrap(<BalancesProvider value={{ state: READY, faucet: true }}><HomeVillageScene {...HOME_VILLAGE.view} /></BalancesProvider>));
    expect(await screen.findAllByRole("region", { name: "Balances" })).toHaveLength(2);
  });

  it("a page's header carries the Cobbles through the shell's provider, and none without it", async () => {
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />));
    expect(screen.queryByRole("button", { name: /Cobbles/ })).toBeNull();
    unmount();
    render(wrap(<BalancesProvider value={{ state: READY }}><HomeVillageScene {...HOME_VILLAGE.view} /></BalancesProvider>));
    expect(await screen.findAllByRole("button", { name: "240 Cobbles: Buy packs" })).toHaveLength(2);
  });

  it("a flow's top bar carries the home's balances in its row: the Cobbles' pill on a phone, the rail from desktop (#781)", async () => {
    const { unmount } = render(wrap(<TopBar title="Choose a mode" />));
    expect(screen.queryByRole("region", { name: "Balances" })).toBeNull();
    unmount();
    render(wrap(<BalancesProvider value={{ state: READY }}><TopBar title="Choose a mode" /></BalancesProvider>));
    const regions = await screen.findAllByRole("region", { name: "Balances" });
    expect(regions).toHaveLength(2);
    const bar = screen.getByRole("heading", { level: 1, name: "Choose a mode" }).closest("header")!;
    for (const region of regions) expect(bar).toContainElement(region);
    expect(regions.map((r) => r.className)).toEqual([expect.stringContaining("desktop:hidden"), expect.stringContaining("hidden desktop:flex")]);
  });
});

describe("the plates (#828)", () => {
  it("a '+' on the balances that lead to a page (PAVED, vPAVED, Cobbles), none on USDC; the icon after the figure", () => {
    const { container } = render(wrap(<Balances layout="rail" state={{ ...READY, vpaved: 1n }} />));
    const plates = [...container.querySelectorAll<HTMLElement>("[data-slot=resource-plate]")];
    expect(plates.map((p) => [p.dataset.token, !!p.querySelector("[data-slot=resource-plus]")])).toEqual([
      ["usdc", false],
      ["paved", true],
      ["vpaved", true],
      ["cobbles", true],
    ]);
    for (const plate of plates) {
      expect(plate.dataset.side).toBe("right");
      // The icon is the plate's last part (over the right end), the "+" its first (over the left end).
      expect(plate.lastElementChild!.querySelector("[data-slot=token-icon]")).not.toBeNull();
    }
    expect(plates[3]!.firstElementChild).toHaveAttribute("data-slot", "resource-plus");
  });

  it("the '+' is an icon, not a character (#845)", () => {
    const { container } = render(wrap(<Balances layout="rail" state={READY} />));
    const pluses = [...container.querySelectorAll("[data-slot=resource-plus]")];
    expect(pluses.length).toBeGreaterThan(0);
    for (const plus of pluses) {
      // A light plus on its green relief button, both drawn by the game icon (#844).
      const icon = plus.querySelector("[data-slot=game-icon][data-icon=plus]")!;
      expect([...icon.querySelectorAll("linearGradient")].map((g) => g.id.replace(/^.*?(green|light)$/, "$1"))).toEqual(["green", "light"]);
      expect(plus).toHaveTextContent("");
    }
  });

  it("the plates are larger from desktop (`rail`) than on a phone (`pill`), the icon taller than the box (#213)", () => {
    const { container, unmount } = render(wrap(<Balances layout="pill" state={READY} />));
    expect(container.querySelector("[data-slot=token-icon]")!.className).toContain("size-12");
    expect(container.querySelector("[data-slot=resource-plate] .h-8")).not.toBeNull();
    unmount();
    const rail = render(wrap(<Balances layout="rail" state={READY} />));
    expect(rail.container.querySelector("[data-slot=token-icon]")!.className).toContain("size-13");
    expect(rail.container.querySelector("[data-slot=resource-plate] .h-9")).not.toBeNull();
  });

  it("the icon stands bare: no disc behind it (#213)", () => {
    const { container } = render(wrap(<Balances layout="rail" state={READY} />));
    for (const plate of container.querySelectorAll("[data-slot=resource-plate]")) expect(plate.querySelector(".rounded-full")).toBeNull();
  });

  it("the mirrored plate puts the icon at the left end and the '+' at the right", () => {
    const { container } = render(wrap(<ResourcePlate kind="cobbles" amount={240n} decimals={0} fraction={0} plus side="left" />));
    const plate = container.querySelector<HTMLElement>("[data-slot=resource-plate]")!;
    expect(plate.dataset.side).toBe("left");
    expect(plate.className).toContain("flex-row-reverse");
  });

  it("column: the balances one under the other, right-aligned", () => {
    render(wrap(<Balances layout="rail" direction="column" state={READY} />));
    expect(screen.getByRole("region", { name: "Balances" }).className).toEqual(expect.stringContaining("flex-col items-end gap-2"));
  });

  it("the home stacks its rail; a page's header keeps it in a row", async () => {
    const { unmount } = render(wrap(<BalancesProvider value={{ state: READY }}><HomeVillageScene {...HOME_VILLAGE.view} /></BalancesProvider>));
    const home = await screen.findAllByRole("region", { name: "Balances" });
    // The pill (one plate) below `desktop`, the stacked rail from it.
    expect(home.map((r) => r.dataset.direction)).toEqual([undefined, "column"]);
    unmount();
    render(wrap(<BalancesProvider value={{ state: READY }}><TopBar title="Choose a mode" /></BalancesProvider>));
    const header = await screen.findAllByRole("region", { name: "Balances" });
    expect(header.map((r) => r.dataset.direction)).toEqual([undefined, "row"]);
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
    // The figure is written at once, not counted up from zero.
    expect(container.querySelector("[data-slot=number-ticker]")).toHaveTextContent(/^240$/);
  });

  it("a first load writes the figure at once", () => {
    const { container } = render(plate(240n));
    expect(container.querySelector("[data-slot=number-ticker]")).toHaveTextContent(/^240$/);
  });

  it("under reduced motion the figure only flashes its colour: no floating change", () => {
    const { container, rerender } = render(plate(240n, "always"));
    rerender(plate(340n, "always"));
    expect(change(container)).toBeNull();
    expect(container.querySelector(".text-success")).not.toBeNull();
  });
});
