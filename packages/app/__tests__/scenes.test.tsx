import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatUnits } from "../src/components/elements/amount";
import { formatRemaining } from "../src/components/elements/countdown";
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
import { RENDERER_ASSETS } from "../src/mocks/assets";
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
    expect(formatLocal(t, "Europe/Paris")).toBe("Thu 15 Oct, 17:00");
    expect(formatLocal(t, "America/New_York")).toBe("Thu 15 Oct, 11:00");
    expect(formatUtc(t)).toBe("2026-10-15 15:00 UTC");
    // Across midnight: Auckland (NZDT, UTC+13) is already on Friday.
    expect(formatLocal(t, "Pacific/Auckland")).toBe("Fri 16 Oct, 04:00");
    // Midnight itself reads 00:00, not 24:00: 22:00 UTC is 00:00 in Paris.
    expect(formatLocal(t + 7 * 3600, "Europe/Paris")).toBe("Fri 16 Oct, 00:00");
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
    expect(screen.getByRole("alert")).toHaveTextContent("Purchases paused");
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
  it("draws the recorded board, the score, the tiles left with discards and the time left", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    expect(screen.getByRole("img", { name: `Board of ${BOARD_38.tiles.length} tiles` })).toBeInTheDocument();
    expect(screen.getByTestId("score-value")).toHaveTextContent(pts(BOARD.placing.score));
    expect(screen.getByTestId("tiles-left")).toHaveTextContent("12");
    expect(screen.getByText("2 discarded")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Expires in 19:00:00" })).toBeInTheDocument();
  });

  it("shows the tile in hand with the board's art, turned to its orientation", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    const chip = within(screen.getByRole("region", { name: "Your tile" })).getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    const art = chip.querySelector("img");
    expect(art).toHaveAttribute("src", `${RENDERER_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(art?.style.transform).toBe(`rotate(${(BOARD_38.next.orientation - 1) * 90}deg)`);
  });

  it("falls back to the tile art when there is no WebGL, without an error", () => {
    // jsdom has no WebGL: the renderer's tile view and the board scene's hand both show the PNG chip.
    const { unmount } = render(wrap(<TileView plan={BOARD_38.next.plan} orientation={2} basePath={RENDERER_ASSETS} />));
    const chip = screen.getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    expect(chip.querySelector("img")).toHaveAttribute("src", `${RENDERER_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(document.querySelector("canvas")).toBeNull();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} renderHandTile={(t) => <TileView {...t} basePath={RENDERER_ASSETS} />} />));
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
    expect(onSurrender).toHaveBeenCalledOnce();
  });

  it("warns when storage is off, and a Training game shows no deadline", () => {
    render(wrap(<BoardScene {...BOARD.storageDisabled} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Storage is off");
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
    expect(screen.getByRole("radio", { name: "Stake 3" })).toHaveAttribute("data-state", "on");
    expect(screen.getByText("+3%")).toBeInTheDocument();
    expect(screen.getByText(/To 0x0456…beef/)).toBeInTheDocument();
    // split_bps 7,368 / 2,632 / 500 of 6 USDC: the referral comes out of the Vault's part, and the parts shown add up
    // to the price shown (4.42 + 1.28 + 0.30 = 6.00).
    const price = screen.getByRole("region", { name: "Price" });
    expect(within(price).getByText("Burned").closest("div")).toHaveTextContent("4.42");
    expect(within(price).getByText("Vault").closest("div")).toHaveTextContent("1.28");
    expect(within(price).getByText("Referral").closest("div")).toHaveTextContent("0.30");
    expect(screen.getByText("expires in 24 h 0 min")).toBeInTheDocument();
    expect(screen.getByText("Thu 15 Oct, 17:00")).toHaveAttribute("dateTime", "2026-10-15T15:00:00.000Z");
    expect(screen.getByText(pts(1150))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay.*6\.00.*USDC.*and play/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: "Stake 7" }));
    expect(onStakeChange).toHaveBeenCalledWith(7);
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
    expect(screen.getByRole("alert")).toHaveTextContent("Purchases paused");
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

  it("leaves the routes without the scenes, so the app bundle is unchanged", () => {
    const routes = files(join(src, "routes")).concat(join(src, "App.tsx"), join(src, "main.tsx"));
    for (const f of routes) expect(readFileSync(f, "utf8")).not.toMatch(/components\/(scenes|containers|elements)|mocks\//);
  });
});
