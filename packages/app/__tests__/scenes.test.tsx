import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatUnits } from "../src/components/elements/amount";
import { Background } from "../src/components/elements/background";
import { Countdown, formatRemaining } from "../src/components/elements/countdown";
import { Score } from "../src/components/elements/score";
import { StatRow } from "../src/components/elements/stat-row";
import { TilesLeft } from "../src/components/elements/tiles-left";
import { AppNav } from "../src/components/containers/app-nav";
import { formatLocal, formatRelative, formatUtc } from "../src/components/elements/deadline";
import { formatPoints } from "../src/components/elements/score";
import { planCode } from "../src/components/elements/tile-chip";
import { TileView } from "../src/components/containers/tile-view";
import { BoardScene } from "../src/components/scenes/board-scene";
import { HomeScene } from "../src/components/scenes/home-scene";
import { LoadingScene } from "../src/components/scenes/loading-scene";
import { OverScene } from "../src/components/scenes/over-scene";
import { PlayScene } from "../src/components/scenes/play-scene";
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import { WelcomeScene } from "../src/components/scenes/welcome-scene";
import { APP_WEB_ASSETS, originalTileArt } from "../src/mocks/assets";
import { BOARD_38, CLOSINGS_38 } from "../src/mocks/board";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { BOARD, HOME, LOADING, OVER, PLAY, PURCHASE, WELCOME } from "../src/mocks/scenes";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/** Points as Testing Library reads them: its matchers collapse the no-break space to a space. */
const pts = (n: number) => formatPoints(n).replace("\u00a0", " ");

describe("element helpers", () => {
  it("writes points with a no-break space every three digits", () => {
    expect(formatPoints(1270)).toBe("1 270");
    expect(formatPoints(980)).toBe("980");
  });

  it("cuts token amounts to their fraction", () => {
    expect(formatUnits(6_000_000n, 6, 2)).toBe("6.00");
    expect(formatUnits(8_429_000_000_000_000_000n, 18, 2)).toBe("8.42");
    expect(formatUnits(12_345_678_900n, 6, 2)).toBe("12,345.67");
  });

  it("counts the time left down to 0:00:00", () => {
    expect(formatRemaining(19 * 3600 + 5)).toBe("19:00:05");
    expect(formatRemaining(-10)).toBe("0:00:00");
  });

  it("writes a deadline as time left, local time and UTC", () => {
    expect(formatRelative(23 * 3600 + 12 * 60 + 59)).toBe("23 h 12 min");
    expect(formatRelative(45 * 60)).toBe("45 min");
    expect(formatRelative(-5)).toBe("0 min");
    // 2026-10-15 15:00 UTC: 17:00 in Paris (summer time), 11:00 in New York.
    const t = MOCK_NOW + DAY;
    expect(formatLocal(t, "Europe/Paris")).toBe("Thu, Oct 15, 17:00");
    expect(formatLocal(t, "America/New_York")).toBe("Thu, Oct 15, 11:00");
    expect(formatUtc(t)).toBe("2026-10-15 15:00 UTC");
    // Across midnight: Auckland (NZDT, UTC+13) is already on Friday.
    expect(formatLocal(t, "Pacific/Auckland")).toBe("Fri, Oct 16, 04:00");
    // Midnight itself reads 00:00, not 24:00: 22:00 UTC is 00:00 in Paris.
    expect(formatLocal(t + 7 * 3600, "Europe/Paris")).toBe("Fri, Oct 16, 00:00");
  });

  it("reads a chain plan id as its nine letters", () => {
    expect(planCode(1)).toBe("CCCCCCCCC");
    expect(planCode(0)).toBe("");
  });
});

describe("Welcome", () => {
  it("offers connect and Training without a wallet", async () => {
    const onConnect = vi.fn();
    const onTraining = vi.fn();
    render(wrap(<WelcomeScene {...WELCOME.firstVisit} onConnect={onConnect} onTraining={onTraining} />));
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    await userEvent.click(screen.getByRole("button", { name: /play training/i }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onTraining).toHaveBeenCalledOnce();
  });

  it("is busy while connecting, and says why a connect failed", () => {
    const { unmount } = render(wrap(<WelcomeScene {...WELCOME.connecting} />));
    expect(screen.getByRole("button", { name: /connecting/i })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /play training/i })).toBeDisabled();
    unmount();
    render(wrap(<WelcomeScene {...WELCOME.failed} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not connect");
  });
});

describe("Loading", () => {
  it("shows an indeterminate bar while booting and the percentage while assets load", () => {
    const { unmount } = render(wrap(<LoadingScene {...LOADING.booting} />));
    expect(screen.getByRole("progressbar", { name: "Starting" })).not.toHaveAttribute("aria-valuenow");
    unmount();
    render(wrap(<LoadingScene {...LOADING.assets} />));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("64%")).toBeInTheDocument();
  });
});

describe("Home", () => {
  it("shows the player, the game to resume, today's top 3 and the five tabs", async () => {
    const onResume = vi.fn();
    render(wrap(<HomeScene {...HOME.connected} onResume={onResume} />));
    expect(screen.getAllByText("bal7hazar").length).toBeGreaterThan(0);
    const podium = screen.getByRole("list", { name: "Today's top 3" });
    expect(within(podium).getAllByRole("listitem")).toHaveLength(4);
    expect(within(podium).getByText("stonemaster")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResume).toHaveBeenCalledWith(1042);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button")).toHaveLength(5);
    expect(within(nav).getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  it("asks a guest to connect and offers no game to resume", () => {
    render(wrap(<HomeScene {...HOME.guest} />));
    expect(screen.getByText("Playing as a guest")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
  });

  it("says the podium is empty on a day nobody finished", () => {
    render(wrap(<HomeScene {...HOME.firstOfDay} />));
    expect(screen.getByText(/No finished game today yet/)).toBeInTheDocument();
  });

  it("disables the Challenge while purchases are paused", () => {
    render(wrap(<HomeScene {...HOME.paused} />));
    expect(screen.getByText(/New Challenge games are paused for now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Challenge/ })).toBeDisabled();
  });
});

describe("Play", () => {
  it("lists the four modes, Multiplayer disabled", async () => {
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} />));
    await userEvent.click(screen.getByRole("button", { name: /^Challenge/ }));
    expect(onChallenge).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Training/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Tutorial/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Multiplayer/ })).toBeDisabled();
  });

  it("connects a guest who picks the Challenge", async () => {
    const onConnect = vi.fn();
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.guest} onConnect={onConnect} onChallenge={onChallenge} />));
    await userEvent.click(screen.getByRole("button", { name: /^Challenge/ }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onChallenge).not.toHaveBeenCalled();
  });

  it("disables the Challenge while purchases are paused", () => {
    render(wrap(<PlayScene {...PLAY.paused} />));
    expect(screen.getByRole("button", { name: /^Challenge/ })).toBeDisabled();
  });
});

describe("Board", () => {
  it("draws the recorded board, the score, the tiles left and the time left", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    expect(screen.getByRole("img", { name: `Board of ${BOARD_38.tiles.length} tiles` })).toBeInTheDocument();
    expect(screen.getByTestId("score-value")).toHaveTextContent(pts(BOARD.placing.score));
    expect(screen.getByTestId("tiles-left")).toHaveTextContent("12");
    expect(screen.queryByText(/discarded/)).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Expires in 19:00:00" })).toBeInTheDocument();
  });

  it("shows the tile in hand with the board's art, turned to its orientation", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    const chip = within(screen.getByRole("region", { name: "Your tile" })).getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    const art = chip.querySelector("img");
    expect(art).toHaveAttribute("src", `${APP_WEB_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(art?.style.transform).toBe(`rotate(${(BOARD_38.next.orientation - 1) * 90}deg)`);
  });

  it("falls back to the tile art when there is no WebGL, without an error", () => {
    // jsdom has no WebGL: the renderer's tile view and the board scene's hand both show the PNG chip.
    const { unmount } = render(wrap(<TileView plan={BOARD_38.next.plan} orientation={2} basePath={APP_WEB_ASSETS} tileArt={originalTileArt(APP_WEB_ASSETS)} />));
    const chip = screen.getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    expect(chip.querySelector("img")).toHaveAttribute("src", `${APP_WEB_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(document.querySelector("canvas")).toBeNull();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} renderHandTile={(t) => <TileView {...t} basePath={APP_WEB_ASSETS} tileArt={originalTileArt(APP_WEB_ASSETS)} />} />));
    const hand = screen.getByRole("region", { name: "Your tile" });
    expect(within(hand).getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "art");
  });

  it("falls back to the plan's nine areas without the art", () => {
    render(wrap(<BoardScene {...BOARD.placing} tileArt={undefined} />));
    expect(within(screen.getByRole("region", { name: "Your tile" })).getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "areas");
  });

  it("waits for a slot before Confirm, then shows the preview points", async () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.placing} />));
    expect(screen.getByRole("button", { name: /Place tile/ })).toBeDisabled();
    unmount();
    const onConfirm = vi.fn();
    const onRotate = vi.fn();
    render(wrap(<BoardScene {...BOARD.slotChosen} onConfirm={onConfirm} onRotate={onRotate} />));
    await userEvent.click(screen.getByRole("button", { name: /Place tile.*\+30/ }));
    await userEvent.click(screen.getByRole("button", { name: "Rotate tile" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onRotate).toHaveBeenCalledOnce();
  });

  it("shows the closing points of the last move", () => {
    render(wrap(<BoardScene {...BOARD.closing} />));
    expect(screen.getByText("City")).toBeInTheDocument();
    expect(screen.getByText("+320")).toBeInTheDocument();
    expect(screen.getByText("+370")).toBeInTheDocument();
  });

  it("locks the hand while a move is pending", () => {
    render(wrap(<BoardScene {...BOARD.pending} />));
    expect(screen.getByRole("button", { name: /Placing/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /Discard/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Surrender/ })).toBeDisabled();
  });

  it("says why a move was refused and lets the player try again", () => {
    render(wrap(<BoardScene {...BOARD.refused} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Move refused");
    expect(screen.getByRole("button", { name: /Place tile/ })).toBeEnabled();
  });

  it("asks to surrender an expired game and allows nothing else", async () => {
    const onSurrender = vi.fn();
    render(wrap(<BoardScene {...BOARD.expired} onSurrender={onSurrender} />));
    expect(screen.getByRole("timer", { name: "Expired" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Place tile/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Discard/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Surrender/ }));
    expect(onSurrender).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Surrender this game?" })).getByRole("button", { name: "Surrender" }));
    expect(onSurrender).toHaveBeenCalledOnce();
  });

  it("asks before a surrender; Esc and Keep playing close the dialog without surrendering (P3)", async () => {
    const onSurrender = vi.fn();
    render(wrap(<BoardScene {...BOARD.placing} onSurrender={onSurrender} />));
    const surrender = screen.getByRole("button", { name: /Surrender/ });
    await userEvent.click(surrender);
    expect(screen.getByRole("dialog", { name: "Surrender this game?" })).toHaveTextContent(pts(BOARD.placing.score));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(surrender);
    await userEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onSurrender).not.toHaveBeenCalled();
  });

  it("warns when the last save was dropped, and plays on the plan view's slots", async () => {
    const onSlotClick = vi.fn();
    const slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
    render(wrap(<BoardScene {...BOARD.storageDisabled} storageDisabled={false} saveDropped slots={[slot]} onSlotClick={onSlotClick} />));
    expect(screen.getByText("Last move not saved")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: `Board of ${BOARD_38.tiles.length} tiles` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Slot / }));
    expect(onSlotClick).toHaveBeenCalledWith(slot);
  });

  it("the plan view lights its slots only while the placement highlight is on; off, they stay buttons", async () => {
    const onSlotClick = vi.fn();
    const slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
    const { rerender } = render(wrap(<BoardScene {...BOARD.storageDisabled} slots={[slot]} onSlotClick={onSlotClick} />));
    expect(screen.getByRole("button", { name: /^Slot / })).toHaveAttribute("data-lit", "true");
    expect(screen.getByRole("button", { name: /^Slot / })).toHaveClass("border-dashed");
    rerender(wrap(<BoardScene {...BOARD.storageDisabled} slots={[slot]} onSlotClick={onSlotClick} placementHighlight={false} />));
    const plain = screen.getByRole("button", { name: /^Slot / });
    expect(plain).toHaveAttribute("data-lit", "false");
    expect(plain).not.toHaveClass("border-dashed");
    expect(plain.className).not.toMatch(/bg-primary/);
    await userEvent.click(plain);
    expect(onSlotClick).toHaveBeenCalledWith(slot);
  });

  it("warns when storage is off, and a Training game shows no deadline", () => {
    render(wrap(<BoardScene {...BOARD.storageDisabled} />));
    expect(screen.getByText("Storage is off")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
  });

  it("draws the 72-tile board and the canvas a page gives instead of the plan view", () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.large} />));
    expect(screen.getByRole("img", { name: "Board of 72 tiles" })).toBeInTheDocument();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} canvas={<canvas data-testid="renderer" />} />));
    expect(screen.getByTestId("renderer")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Board of/ })).not.toBeInTheDocument();
  });
});

describe("Over", () => {
  it("shows the final score, the metrics, every closing and the reward", () => {
    render(wrap(<OverScene {...OVER.rewarded} />));
    expect(screen.getByTestId("score-value")).toHaveTextContent(pts(OVER.rewarded.game.score));
    expect(screen.getByText("New best")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Closings" })).getAllByRole("listitem")).toHaveLength(CLOSINGS_38.length);
    const reward = screen.getByRole("region", { name: "Reward" });
    expect(reward).toHaveAttribute("data-state", "rewarded");
    expect(reward).toHaveTextContent("8.42");
    expect(reward).toHaveTextContent("beaten by 120");
  });

  it.each([
    ["awaiting", /after the day closes/],
    ["settle", /Settle and claim/],
    ["below", /stake is lost/],
    ["expired", /within 24 h/],
    ["training", /no stake, no reward/],
  ] as const)("tells the %s reward state", (state, text) => {
    render(wrap(<OverScene {...OVER[state]} />));
    expect(screen.getByRole("region", { name: "Reward" })).toHaveTextContent(text);
  });

  it("says so when the game closed nothing", () => {
    render(wrap(<OverScene {...OVER.noClosing} />));
    expect(screen.getByText("No structure closed in this game.")).toBeInTheDocument();
  });
});

describe("Purchase", () => {
  it("prices the stake, its boost and split, the 24 h validity and the threshold", async () => {
    const onStakeChange = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.stake3Referred} onStakeChange={onStakeChange} />));
    const slider = screen.getByRole("slider", { name: "Stake" });
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute("aria-valuemin", "1");
    expect(slider).toHaveAttribute("aria-valuemax", "10");
    expect(screen.getByTestId("stake-value")).toHaveTextContent("3");
    expect(screen.getByTestId("stake-price")).toHaveTextContent("6.00");
    expect(screen.getByText("+3%")).toBeInTheDocument();
    // The referrer's address is cut in the middle, whole in its title (WRAP360).
    const referrer = screen.getByTitle("0x0456bb00000000000000000000000000000000000000000000000000000beef");
    expect(referrer).toHaveTextContent("0x0456…beef");
    expect(referrer.parentElement).toHaveTextContent(/^To 0x0456…beef/);
    // split_bps 7,368 / 2,632 / 500 of 6 USDC: the referral comes out of the Vault's part, and the parts shown add up
    // to the price shown (4.42 + 1.28 + 0.30 = 6.00).
    const price = screen.getByRole("region", { name: "Price" });
    expect(within(price).getByText("Burned").closest("div")).toHaveTextContent("4.42");
    expect(within(price).getByText("Vault").closest("div")).toHaveTextContent("1.28");
    expect(within(price).getByText("Referral").closest("div")).toHaveTextContent("0.30");
    expect(screen.getByText("expires in 24 h 0 min")).toBeInTheDocument();
    expect(screen.getByText("Thu, Oct 15, 17:00")).toHaveAttribute("dateTime", "2026-10-15T15:00:00.000Z");
    expect(screen.getByText(pts(1150))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay.*6\.00.*USDC.*and play/ })).toBeEnabled();
    // Keyboard: the value is the scene's (a prop), so each key moves one step from 3.
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onStakeChange).toHaveBeenLastCalledWith(4);
    await userEvent.keyboard("{End}");
    expect(onStakeChange).toHaveBeenLastCalledWith(10);
    await userEvent.keyboard("{Home}");
    expect(onStakeChange).toHaveBeenLastCalledWith(1);
  });

  it("boosts the burn by 10% at the highest stake", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    expect(screen.getByText("+10%")).toBeInTheDocument();
    expect(screen.getByText(/No referrer: the Vault keeps it/)).toBeInTheDocument();
    const price = screen.getByRole("region", { name: "Price" });
    expect(within(price).getByText("Burned").closest("div")).toHaveTextContent("14.73");
    expect(within(price).getByText("Vault").closest("div")).toHaveTextContent("5.27");
    expect(within(price).getByText("Referral").closest("div")).toHaveTextContent("0.00");
  });

  it("refuses to pay with too little USDC, or while purchases are paused", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.short} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough USDC");
    expect(screen.getByRole("button", { name: /Pay/ })).toBeDisabled();
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.paused} />));
    expect(screen.getByText("Purchases paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay/ })).toBeDisabled();
  });

  it("is busy while the purchase is on its way", () => {
    render(wrap(<PurchaseScene {...PURCHASE.buying} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toHaveAttribute("aria-busy", "true");
  });
});

describe("no wiring (SC1, SC2)", () => {
  const src = join(__dirname, "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

  const tiers = () => ["components/elements", "components/containers", "components/scenes", "mocks"].flatMap((d) => files(join(src, d)));

  it("imports only types from @paved/chain in the scenes, containers, elements and mocks", () => {
    const valueImports = tiers().filter((f) => /^import (?!type )[^;]*from "@paved\/chain"/m.test(readFileSync(f, "utf8")));
    expect(valueImports).toEqual([]);
  });

  // SC2: the quests, achievements and referral read the indexer's answers. Its package is the daemon (SQLite, starknet.js):
  // never a value import, and no request (fetch, the chain package's IndexerClient, a session) from these tiers.
  it("imports only types from @paved/indexer, and calls no indexer, chain or session", () => {
    const valueImports = tiers().filter((f) => /^import (?!type )[^;]*from "@paved\/indexer[^"]*"/m.test(readFileSync(f, "utf8")));
    expect(valueImports).toEqual([]);
    const calls = tiers().filter((f) => /\bfetch\(|IndexerClient|createEconomyClient|RpcEconomyViews|EconomyWriter|PageSession|LocalSession|useAsyncRead|useIndexerRead/.test(readFileSync(f, "utf8")));
    expect(calls).toEqual([]);
  });

  // P1 put the shell on the routes: the pages import their scenes, lazily (routes/pages/*). The first bundle's own files
  // (the entry, the app, the router table) hold no scene and no mock; the lazy modules are checked by the built chunk list.
  it("keeps the entry, the app and the router table free of scenes and mocks", () => {
    for (const f of ["main.tsx", "App.tsx", "routes/router.tsx"]) expect(readFileSync(join(src, f), "utf8")).not.toMatch(/components\/scenes|mocks\//);
  });

  it("reaches the page modules only through import(), never statically", () => {
    const outside = files(join(src, "routes")).filter((f) => !f.includes(join("routes", "pages")) && !f.endsWith("pages.ts"));
    for (const f of outside) expect(readFileSync(f, "utf8")).not.toMatch(/^\s*(import|export)\b[^;]*from\s+["']\.\/pages\//m);
    // The page loaders (`page-loaders.ts`) are the one table of `import()`s; the router and the prefetch go through it.
    const loaders = readFileSync(join(src, "routes/page-loaders.ts"), "utf8");
    const dynamic = [...loaders.matchAll(/import\("\.\/pages\/[\w-]+"\)/g)].length;
    expect(dynamic).toBeGreaterThanOrEqual(14);
    expect(loaders.match(/\.\/pages\//g)).toHaveLength(dynamic);
    const router = readFileSync(join(src, "routes/router.tsx"), "utf8");
    expect(router).toMatch(/PAGE_LOADERS/);
    // The router's own `import()` is the not-found page, which is in no route of the table.
    expect(router.match(/\.\/pages\//g)).toHaveLength([...router.matchAll(/import\("\.\/pages\/[\w-]+"\)/g)].length);
  });
});

describe("Element feedback (EL)", () => {
  it("puts the icon on the value's row, under the title", () => {
    const { container, unmount } = render(<Score value={1270} label="Score" icon="star" />);
    const value = screen.getByTestId("score-value");
    const icon = container.querySelector("[data-icon='star']")!;
    expect(value.parentElement).toBe(icon.parentElement!.parentElement);
    expect(screen.getByText("Score").parentElement).not.toBe(value.parentElement);
    unmount();
    const tiles = render(<TilesLeft remaining={12} />);
    const left = screen.getByTestId("tiles-left");
    expect(tiles.container.querySelector("[data-icon='table-cells-large']")!.parentElement!.parentElement).toBe(left.parentElement);
    expect(tiles.container).not.toHaveTextContent(/discard/i);
  });

  it("keeps a stat row's hint under its label, the icon and the value on the first row", () => {
    const { container } = render(<StatRow icon="city" label="Cities closed" hint="450 pts" value={4} />);
    const row = container.firstElementChild!;
    expect(row.className).toContain("grid");
    expect(screen.getByText("450 pts").className).toContain("col-start-2");
  });

  it("hides the countdown's label and keeps its accessible name", () => {
    render(<Countdown expiresAt={MOCK_NOW + 9 * 3600} now={MOCK_NOW} label="Closes in" hideLabel />);
    expect(screen.queryByText("Closes in")).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Closes in 9:00:00" })).toBeInTheDocument();
  });

  it("draws the Vault tab with the piggy bank, and the bar sticky at the bottom", () => {
    render(wrap(<AppNav active="home" />));
    const vault = screen.getByRole("button", { name: "Vault" });
    expect(vault.querySelector("[data-icon='piggy-bank']")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Main" }).className).toMatch(/sticky.*bottom-0/);
  });

  it("serves the background as AVIF, WebP and a JPEG fallback from this host", () => {
    const { container } = render(<Background base="/" />);
    const sources = [...container.querySelectorAll("source")].map((e) => [e.type, e.srcset] as const);
    expect(sources.map(([t]) => t)).toEqual(["image/avif", "image/webp"]);
    expect(sources[0]![1]).toContain("/backgrounds/placeholder-720.avif 720w");
    expect(container.querySelector("img")).toHaveAttribute("src", "/backgrounds/placeholder-1440.jpg");
    expect(container.innerHTML).not.toMatch(/https?:/);
  });
});
