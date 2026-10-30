import { slow } from "../test-slow";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Balances, type BalancesState } from "../src/components/containers/balances";
import { BalancesProvider } from "../src/components/containers/balances-context";
import { TopBar } from "../src/components/containers/top-bar";
import { ResourcePlate } from "../src/components/elements/resource-plate";
import { PLATE_NARROW_QUERY } from "../src/components/elements/plate";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
/** The crowded stack's rule (theme.css): jsdom applies no stylesheet, so the rule is read where it is written. */
const CROWDED_RULE = readFileSync(resolve(import.meta.dirname, "../src/styles/theme.css"), "utf8").match(/\[data-crowded\] \[data-kind\]:not\(\[data-kind="cobbles"\]\) \{[^}]*\}/)?.[0] ?? "";
const READY: BalancesState = { status: "ready", usdc: 48_500_000n, paved: 142_350_000_000_000_000_000n, cobbles: 240 };

describe("Balances (#538), the resource bar (#620)", () => {
  it("pill: the page's balances alone (#855), the Cobbles' plate leading to the packs", async () => {
    const onAction = vi.fn();
    render(wrap(<Balances layout="pill" kinds={["cobbles"]} state={READY} onAction={onAction} />));
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
    await userEvent.click(screen.getByRole("button", { name: "142.35 PAVED: Play a Challenge" }));
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

  // #925 (the owner's ruling, 2026-10-30): no "+" on a phone's plate, so #860's one width needs no room for one. From `desktop`
  // the rail keeps its "+" until #925 removes it everywhere.
  it("pill: no \"+\" on a phone's plate, in a row of two or alone; the rail's at every width", () => {
    const plusesOf = (container: HTMLElement) => container.querySelectorAll("[data-slot=resource-plus]");
    const vault = render(wrap(<Balances layout="pill" kinds={["paved", "vpaved"]} here={["vpaved"]} state={{ ...READY, vpaved: 1n }} />));
    expect(plusesOf(vault.container)).toHaveLength(0);
    vault.unmount();
    const lone = render(wrap(<Balances layout="pill" kinds={["cobbles"]} state={READY} />));
    expect(plusesOf(lone.container)).toHaveLength(0);
    // The end where the "+" stood takes a bare end's padding.
    expect(lone.container.querySelector(".h-8")).toHaveClass("pl-2.5");
    lone.unmount();
    const rail = render(wrap(<Balances layout="rail" kinds={["paved", "vpaved"]} here={["vpaved"]} state={{ ...READY, vpaved: 1n }} />));
    expect(plusesOf(rail.container)).toHaveLength(1);
    expect(plusesOf(rail.container)[0]).not.toHaveClass("hidden");
  });

  it("a balance with no source is a dash", () => {
    render(wrap(<Balances layout="rail" state={{ ...READY, paved: null }} />));
    expect(screen.getByRole("button", { name: "PAVED unavailable: Play a Challenge" })).toHaveTextContent("–");
  });

  it("an error is inline, not a toast", () => {
    render(wrap(<Balances layout="rail" state={{ status: "error", message: "RPC down" }} />));
    expect(screen.getByRole("alert")).toHaveTextContent("RPC down");
  });

  it("a failed read retries (#918): Retry beside the message from desktop, the mark itself on a phone", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(wrap(<Balances layout="rail" state={{ status: "error", message: "Can't reach the network." }} onRetry={onRetry} />));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    unmount();
    render(wrap(<Balances layout="pill" state={{ status: "error", message: "Can't reach the network." }} onRetry={onRetry} />));
    await userEvent.click(screen.getByRole("button", { name: "Balances unavailable: Can't reach the network. Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("the browser's \"Failed to fetch\" reads as the network's, short (#918)", () => {
    render(wrap(<Balances layout="rail" state={{ status: "error", message: "Failed to fetch" }} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Balances: Can't reach the network.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
  });

  it("while it retries, the mark waits", () => {
    render(wrap(<Balances layout="pill" state={{ status: "error", message: "Can't reach the network.", retrying: true }} onRetry={vi.fn()} />));
    expect(screen.getByRole("button", { name: "Balances unavailable: Can't reach the network. Retrying…" })).toBeDisabled();
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
    expect(screen.getByRole("region", { name: "Balances" }).className).toEqual(expect.stringContaining("flex-col items-end gap-3"));
  });

  it("no balances, nothing drawn", () => {
    render(wrap(<Balances layout="rail" kinds={[]} state={READY} />));
    expect(screen.queryByRole("region", { name: "Balances" })).toBeNull();
  });

  it("a guest's Connect names the page's balances from desktop", () => {
    render(wrap(<Balances layout="rail" kinds={["cobbles", "usdc"]} state={{ status: "disconnected" }} />));
    expect(screen.getByText("Connect to see your Cobbles and USDC.")).toBeInTheDocument();
  });

  it("loading: a skeleton per balance shown, none for vPAVED while unknown", () => {
    const { container } = render(wrap(<Balances layout="pill" kinds={["cobbles", "paved", "vpaved-held"]} state={{ status: "loading" }} />));
    expect(container.querySelectorAll("[data-slot=skeleton]")).toHaveLength(2);
  });

  // #855's second open point: the phone stack gives way to the Cobbles alone where its widest plate would cover the League control.
  // jsdom lays nothing out: the plates' widths and the stack's and the League control's edges are stubbed as measured at 320 px.
  it.each([
    ["a large PAVED balance crowds the League control: the Cobbles alone", 213, true],
    ["an ordinary one fits beside it: the whole stack", 120, false],
  ])("the home's phone stack: %s", async (_, paved, crowded) => {
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.kind === "paved" ? paved : this.dataset.kind ? 110 : 0;
    });
    // As the browser's: a first notice for each box as it starts being watched (the setup's stand-in never calls back).
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private seen = new Set<Element>();
        constructor(private notify: ResizeObserverCallback) {}
        observe(box: Element) {
          if (this.seen.has(box)) return;
          this.seen.add(box);
          queueMicrotask(() => this.notify([], this as unknown as ResizeObserver));
        }
        unobserve() {}
        disconnect() {
          this.seen.clear();
        }
      },
    );
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const right = this.dataset.direction === "column" ? 312 : this.dataset.slot === "league-control" ? 167 : 0;
      return { right, left: 0, top: 0, bottom: 0, width: right, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      render(wrap(<BalancesProvider value={{ state: { ...READY, vpaved: 1n } }}><HomeVillageScene {...HOME_VILLAGE.view} /></BalancesProvider>));
      const stack = document.querySelector<HTMLElement>("[data-slot=home-phone-balances]")!;
      await within(stack).findByRole("button", { name: /^\S+ PAVED: Play a Challenge$/ }, { timeout: slow(5000) });
      await waitFor(() => expect(document.querySelector("[data-slot=league-control]")).not.toBeNull(), { timeout: slow(5000) });
      await waitFor(() => expect(stack.querySelector("section")!.hasAttribute("data-crowded")).toBe(crowded));
      // Crowded, the other plates leave the flow, hidden from sight and from assistive technology; the Cobbles' plate stays.
      expect(CROWDED_RULE).toMatch(/visibility: hidden;\s+position: absolute;/);
      expect(within(stack).getByRole("button", { name: /Cobbles: Buy packs/ })).toBeInTheDocument();
    } finally {
      width.mockRestore();
      rect.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("the home stacks its balances below desktop and puts them in a row from it (#856); a page's header keeps them in a row", async () => {
    const { unmount } = render(wrap(<BalancesProvider value={{ state: READY }}><HomeVillageScene {...HOME_VILLAGE.view} /></BalancesProvider>));
    const home = await screen.findAllByRole("region", { name: "Balances" });
    // The phone's plates below `desktop`, stacked (#855: the home's set at every width); the larger ones from it in a row (#856).
    expect(home.map((r) => r.dataset.direction)).toEqual(["column", "row"]);
    unmount();
    render(wrap(<BalancesProvider value={{ state: READY }}><TopBar title="Choose a mode" /></BalancesProvider>));
    const header = await screen.findAllByRole("region", { name: "Balances" });
    expect(header.map((r) => r.dataset.direction)).toEqual(["row", "row"]);
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

describe("one width for every currency's plate (#860)", () => {
  const ZERO: BalancesState = { status: "ready", usdc: 0n, paved: 0n, vpaved: 0n, cobbles: 0 };
  const HUGE: BalancesState = { status: "ready", usdc: 1_234_567_000_000n, paved: 1_234_567n * 10n ** 18n, vpaved: 1_234_567n * 10n ** 18n, cobbles: 1_234_567 };
  const KINDS = ["usdc", "paved", "vpaved", "cobbles"] as const;
  const platesOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-slot=resource-plate]")];
  const widthOf = (plate: HTMLElement) => [...plate.classList].filter((c) => /(^|:)w-/.test(c)).join(" ");
  const boxOf = (plate: HTMLElement) => plate.querySelector<HTMLElement>(".h-8, .h-9")!;
  const tickerOf = (name: string) => screen.getByRole("button", { name }).querySelector("[data-slot=number-ticker]");

  it.each([
    ["pill", "w-34 max-mobile:w-29"],
    ["rail", "w-47"],
  ] as const)("%s: 0 and 1,234,567 of each currency, in a column and in a row, with or without a \"+\", have one width (%s)", (layout, width) => {
    for (const direction of ["column", "row"] as const)
      for (const state of [ZERO, HUGE]) {
        const { container, unmount } = render(wrap(<Balances layout={layout} kinds={KINDS} direction={direction} state={state} faucet />));
        const plates = platesOf(container);
        expect(plates).toHaveLength(4);
        for (const plate of plates) {
          expect(widthOf(plate)).toBe(width);
          // The box takes what the ends leave, so the figure never sizes the plate.
          expect(boxOf(plate)).toHaveClass("flex-1", "min-w-0");
        }
        unmount();
      }
  });

  it("a lone plate and a header's two share the phone's width and figure", () => {
    const lone = render(wrap(<Balances layout="pill" kinds={["cobbles"]} state={READY} />));
    const [one] = platesOf(lone.container);
    const loneWidth = widthOf(one!);
    const loneBox = boxOf(one!).className;
    lone.unmount();
    const vault = render(wrap(<Balances layout="pill" kinds={["paved", "vpaved"]} here={["vpaved"]} state={{ ...READY, vpaved: 1n }} />));
    for (const plate of platesOf(vault.container)) {
      expect(widthOf(plate)).toBe(loneWidth);
      expect(boxOf(plate)).toHaveClass("text-sm", "max-mobile:text-xs");
    }
    expect(loneBox).toContain("max-mobile:text-xs");
  });

  it("on a phone from 360 px the figure is whole below 10,000 (\"9,999.99\") and compact from it", () => {
    const widest: BalancesState = { status: "ready", usdc: 9_999_999_999n, paved: 0n, cobbles: 12_345 };
    render(wrap(<Balances layout="pill" kinds={["usdc", "cobbles"]} direction="column" state={widest} faucet />));
    expect(tickerOf("9,999.99 USDC: Get test USDC")).toHaveTextContent(/^9,999\.99$/);
    expect(screen.getByRole("button", { name: "9,999.99 USDC: Get test USDC" })).not.toHaveAttribute("title");
    expect(tickerOf("12,345 Cobbles: Buy packs")).toHaveTextContent(/^12\.3K$/);
    expect(screen.getByRole("button", { name: "12,345 Cobbles: Buy packs" })).toHaveAttribute("title", "12,345 Cobbles");
  });

  it("below 360 px, the 116 px plate's figure is compact from 1,000, its full amount in the plate's name and tooltip", () => {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({ matches: query === PLATE_NARROW_QUERY, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      render(wrap(<Balances layout="pill" kinds={["paved", "cobbles"]} direction="column" state={{ ...READY, paved: 1_234_560_000_000_000_000_000n }} />));
      const name = "1,234.56 PAVED: Play a Challenge";
      expect(screen.getByRole("button", { name })).toHaveAttribute("title", "1,234.56 PAVED");
      expect(tickerOf(name)).toHaveTextContent(/^1\.2K$/);
      expect(tickerOf("240 Cobbles: Buy packs")).toHaveTextContent(/^240$/);
      expect(screen.getByRole("button", { name: "240 Cobbles: Buy packs" })).not.toHaveAttribute("title");
    } finally {
      window.matchMedia = real;
    }
  });

  it("from desktop the figure is whole below 10,000 and compact from it", () => {
    const widest: BalancesState = { status: "ready", usdc: 9_999_999_999n, paved: 0n, cobbles: 1_234_567 };
    render(wrap(<Balances layout="rail" kinds={["usdc", "cobbles"]} state={widest} faucet />));
    expect(tickerOf("9,999.99 USDC: Get test USDC")).toHaveTextContent(/^9,999\.99$/);
    expect(screen.getByRole("button", { name: "9,999.99 USDC: Get test USDC" })).not.toHaveAttribute("title");
    expect(tickerOf("1,234,567 Cobbles: Buy packs")).toHaveTextContent(/^1\.2M$/);
    expect(screen.getByRole("button", { name: "1,234,567 Cobbles: Buy packs" })).toHaveAttribute("title", "1,234,567 Cobbles");
  });

  it("a change keeps the width: the plate is the same before and after, the change itself compact", () => {
    const { container, rerender } = render(wrap(<Balances layout="pill" kinds={["cobbles"]} state={ZERO} />));
    const before = platesOf(container)[0]!.className;
    rerender(wrap(<Balances layout="pill" kinds={["cobbles"]} state={HUGE} />));
    expect(platesOf(container)[0]!.className).toBe(before);
    expect(container.querySelector("[data-slot=resource-change]")).toHaveTextContent("+1.2M");
  });

  it("loading: each skeleton takes its plate's width, nothing moves when the figures arrive", () => {
    for (const [layout, width] of [["pill", "w-34"], ["rail", "w-47"]] as const) {
      const { container, unmount } = render(wrap(<Balances layout={layout} kinds={["usdc", "cobbles"]} state={{ status: "loading" }} />));
      const holds = container.querySelectorAll("[data-slot=skeleton]");
      expect(holds).toHaveLength(2);
      for (const hold of holds) expect(hold).toHaveClass(width);
      unmount();
    }
  });

  it("a plate without `fixed` fits its content (the League's and the shield's plates, not currencies)", () => {
    const { container } = render(wrap(<ResourcePlate kind="usdc" amount={1n} decimals={6} fraction={2} />));
    expect(widthOf(platesOf(container)[0]!)).toBe("");
  });
});
