import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatDay } from "../src/components/elements/day-picker";
import { formatPoints } from "../src/components/elements/score";
import { formatBps } from "../src/components/containers/split-bar";
import { parseUnits } from "../src/components/containers/vault-form";
import { vaultRate } from "../src/components/containers/vault-position";
import { AchievementsScene } from "../src/components/scenes/achievements-scene";
import { LeaderboardScene } from "../src/components/scenes/leaderboard-scene";
import { PlayerScene } from "../src/components/scenes/player-scene";
import { QuestsScene } from "../src/components/scenes/quests-scene";
import { ReferralScene } from "../src/components/scenes/referral-scene";
import { SettingsScene } from "../src/components/scenes/settings-scene";
import { ThemeScene } from "../src/components/scenes/theme-scene";
import { VaultScene } from "../src/components/scenes/vault-scene";
import { Toaster, toast } from "../src/components/ui/sonner";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { PAGE } from "../src/mocks/leaderboard";
import { PLAYER_ID, TODAY } from "../src/mocks/players";
import { ACHIEVEMENTS_MIXED, QUESTS_ALL_DONE, QUESTS_TODAY, QUESTS_TODAY_COMPLETED, QUESTS_TODAY_ONE_TO_GO, QUESTS_WEEKLY_DONE } from "../src/mocks/quests";
import { REFERRAL_LINK } from "../src/mocks/referral";
import { ACHIEVEMENTS, LEADERBOARD, PLAYER_PAGE, QUESTS, REFERRAL, SETTINGS, THEME, VAULT } from "../src/mocks/scenes";
import { PREVIEW_WITHDRAW_500, VAULT_HELD } from "../src/mocks/vault";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/** Points as Testing Library reads them: its matchers collapse the no-break space to a space. */
const pts = (n: number) => formatPoints(n).replace(" ", " ");

describe("SC2 helpers", () => {
  it("dates a day id in UTC", () => {
    expect(TODAY).toBe(Math.floor(MOCK_NOW / DAY));
    expect(formatDay(TODAY)).toBe("Wed 14 Oct");
    expect(formatDay(TODAY - 1)).toBe("Tue 13 Oct");
  });

  it("parses a typed amount, and refuses what is not one", () => {
    expect(parseUnits("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseUnits(".25", 6)).toBe(250_000n);
    expect(parseUnits("", 18)).toBeNull();
    expect(parseUnits("1.2.3", 18)).toBeNull();
    expect(parseUnits("0.0000001", 6)).toBeNull();
  });

  it("takes the exit fee with V1b's rounding: inside a redeem, on top of a withdraw (vault.cairo:233, :240, :299)", () => {
    // max_withdraw = value - ceil(value x 500 / 10,500), the value 1,355.68... $TILE.
    expect(VAULT_HELD.maxWithdraw).toBe(VAULT_HELD.value - (VAULT_HELD.value * 500n + 10_499n) / 10_500n);
    expect(VAULT_HELD.maxWithdraw).toBe(1_291_127_314_285_714_285_713n);
    // withdraw 500: the shares of 500 + ceil(500 x 500 / 10,000) = 525 $TILE, rounded up.
    expect(PREVIEW_WITHDRAW_500).toBe(484_228_002_213_613_724_406n);
  });

  it("reads the Vault's rate as OpenZeppelin's conversion, and bps as a percentage", () => {
    expect(vaultRate(VAULT_HELD.totalAssets, VAULT_HELD.totalSupply)).toBe(1_084_199_999_999_999_999n);
    expect(formatBps(500)).toBe("5%");
    expect(formatBps(7_368)).toBe("73.68%");
  });

});

describe("Leaderboard", () => {
  it("ranks today's first page, the viewer outlined in place, the close counting down", async () => {
    const onSelectPlayer = vi.fn();
    const onDayChange = vi.fn();
    render(wrap(<LeaderboardScene {...LEADERBOARD.today} onSelectPlayer={onSelectPlayer} onDayChange={onDayChange} />));
    const list = screen.getByRole("list", { name: "Ranking" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(PAGE);
    const self = within(list).getByRole("button", { current: true });
    expect(self).toHaveTextContent("7");
    expect(self).toHaveTextContent("bal7hazar(you)");
    expect(self).toHaveTextContent(pts(1270));
    expect(list.parentElement).toHaveTextContent("20 of 41 players ranked");
    expect(screen.getByRole("timer", { name: "Closes in 9:00:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onDayChange).toHaveBeenCalledWith(TODAY - 1);
    await userEvent.click(within(list).getAllByRole("button")[0]);
    expect(onSelectPlayer).toHaveBeenCalledWith("0x0123aa");
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Ranks" })).toHaveAttribute("aria-current", "page");
    // A full scene with many rows and three clicks, on a slow CI runner: 5.1 to 5.4 s there, over vitest's 5 s default.
  }, 20_000);

  it("ranks the rows in score order", () => {
    for (const state of ["today", "closed", "offTop"] as const) {
      const scores = LEADERBOARD[state].leaderboard.entries.map((e) => e.bestScore);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(LEADERBOARD[state].leaderboard.entries.map((e) => e.rank)).toEqual(scores.map((_, i) => i + 1));
    }
  });

  it("shows a closed day as final", () => {
    render(wrap(<LeaderboardScene {...LEADERBOARD.closed} />));
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText(/its ranking is final/)).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();
    expect(screen.getByRole("button", { current: true })).toHaveTextContent(pts(1840));
  });

  it("says a day is empty", () => {
    render(wrap(<LeaderboardScene {...LEADERBOARD.empty} />));
    expect(screen.getByText("Nobody finished a game this day")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Ranking" })).not.toBeInTheDocument();
  });

  it("follows the page with the viewer's own row when they are off the top", () => {
    render(wrap(<LeaderboardScene {...LEADERBOARD.offTop} />));
    expect(within(screen.getByRole("list", { name: "Ranking" })).queryByRole("button", { current: true })).not.toBeInTheDocument();
    const own = within(screen.getByRole("list", { name: "Your rank" })).getByRole("button", { current: true });
    expect(own).toHaveTextContent("34");
    expect(own).toHaveTextContent(pts(360));
  });

  it("outlines nobody for a guest", () => {
    render(wrap(<LeaderboardScene {...LEADERBOARD.guest} />));
    expect(screen.queryByRole("button", { current: true })).not.toBeInTheDocument();
  });

  it("shows the rows' shape while loading, and the indexer's error with Retry", async () => {
    const { unmount } = render(wrap(<LeaderboardScene {...LEADERBOARD.loading} />));
    expect(screen.getByRole("status", { name: "Loading the ranking" })).toBeInTheDocument();
    unmount();
    const onRetry = vi.fn();
    render(wrap(<LeaderboardScene {...LEADERBOARD.error} onRetry={onRetry} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the ranking");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("Player", () => {
  it("shows another player's record, today's rank and last games", async () => {
    const onBack = vi.fn();
    render(wrap(<PlayerScene {...PLAYER_PAGE.other} onBack={onBack} />));
    expect(screen.getByText("stonemaster")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    const record = screen.getByRole("region", { name: "Record" });
    expect(within(record).getByText("Best score").closest("div")?.parentElement).toHaveTextContent(pts(2310));
    expect(within(record).getByText("Rewards").closest("div")?.parentElement).toHaveTextContent("1,204.50");
    expect(within(screen.getByRole("list", { name: "Games" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText("You")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("marks the viewer's own page and their running game", () => {
    render(wrap(<PlayerScene {...PLAYER_PAGE.self} />));
    expect(screen.getByText("You")).toBeInTheDocument();
    const games = screen.getByRole("list", { name: "Games" });
    expect(within(games).getByText("In progress")).toBeInTheDocument();
    expect(within(games).getByText("Awaiting the day")).toBeInTheDocument();
    expect(within(games).getByText("Below the threshold")).toBeInTheDocument();
  });

  it("says when the indexer does not know the address, and loads", () => {
    const { unmount } = render(wrap(<PlayerScene {...PLAYER_PAGE.unknown} />));
    expect(screen.getByText(/seen no game from this address/)).toBeInTheDocument();
    expect(screen.getAllByText("0x07a1…7e8f").length).toBeGreaterThan(0);
    unmount();
    render(wrap(<PlayerScene {...PLAYER_PAGE.loading} />));
    expect(screen.queryByRole("list", { name: "Games" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Record" }).querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(0);
  });
});

describe("Vault", () => {
  it("shows the vPAVED, their value, max_withdraw, the rate and the exit fee", () => {
    render(wrap(<VaultScene {...VAULT.position} />));
    const position = screen.getByRole("region", { name: "Your position" });
    expect(position).toHaveTextContent("1,250.40vPAVED");
    expect(position).toHaveTextContent("1,355.68$TILE");
    expect(within(position).getByText("Withdrawable now").closest("div")?.parentElement).toHaveTextContent("1,291.12");
    expect(within(position).getByText("Rate").closest("div")?.parentElement).toHaveTextContent("1 : 1.0841");
    expect(within(position).getByText("Exit fee").closest("div")?.parentElement).toHaveTextContent("5%");
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Vault" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the split of each purchase: burn 73.68%, Vault 26.32%, the referral's 5% out of the Vault's part", () => {
    render(wrap(<VaultScene {...VAULT.position} />));
    expect(screen.getByRole("img", { name: "Burned 73.68%, Vault 21.32%, Referral 5%" })).toBeInTheDocument();
    const split = screen.getByRole("region", { name: "Where purchases go" });
    expect(split).toHaveTextContent("26.32%");
  });

  it("withdraws and withdraws all from a position", async () => {
    const onWithdraw = vi.fn();
    const onWithdrawAll = vi.fn();
    render(wrap(<VaultScene {...VAULT.position} onWithdraw={onWithdraw} onWithdrawAll={onWithdrawAll} />));
    expect(screen.getByText(/Uses about/)).toHaveTextContent("484.22vPAVED");
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await userEvent.click(screen.getByRole("button", { name: /Withdraw all/ }));
    expect(onWithdraw).toHaveBeenCalledOnce();
    expect(onWithdrawAll).toHaveBeenCalledOnce();
  });

  it("offers a first deposit with its preview when there is no position", async () => {
    const onDeposit = vi.fn();
    const onModeChange = vi.fn();
    render(wrap(<VaultScene {...VAULT.noPosition} onDeposit={onDeposit} onModeChange={onModeChange} />));
    expect(screen.getByText("No vPAVED yet")).toBeInTheDocument();
    expect(screen.getByText(/You get about/)).toHaveTextContent("92.23vPAVED");
    await userEvent.click(screen.getByRole("button", { name: "Deposit" }));
    expect(onDeposit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("tab", { name: "Withdraw" }));
    expect(onModeChange).toHaveBeenCalledWith("withdraw");
  });

  it.each([
    ["depositing", /Approve and deposit in your wallet: one transaction for both/],
    ["withdrawing", /Confirm the withdraw in your wallet/],
  ] as const)("is busy while %s", (state, text) => {
    render(wrap(<VaultScene {...VAULT[state]} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(text)).toHaveAttribute("role", "status");
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("shows the exit fee before a withdraw is sent: on top of the amount, and inside Withdraw all", () => {
    render(wrap(<VaultScene {...VAULT.position} />));
    const before = screen.getByLabelText("Before you withdraw");
    // 5 % of 500 $TILE, on top.
    expect(screen.getByTestId("withdraw-fee")).toHaveTextContent("25.00");
    expect(before).toHaveTextContent(/You receive\s*500.00/);
    // Withdraw all pays max_withdraw, the value less it taken.
    expect(screen.getByText(/Withdraw all pays/)).toHaveTextContent("1,291.12");
    expect(screen.getByText(/Withdraw all pays/)).toHaveTextContent("64.55");
  });

  it("shows the share of the Vault, and the delegate read only", () => {
    const { unmount } = render(wrap(<VaultScene {...VAULT.position} />));
    expect(screen.getByText("Your share of the Vault").parentElement).toHaveTextContent("0.25%");
    expect(screen.queryByText("Votes")).not.toBeInTheDocument();
    unmount();
    render(wrap(<VaultScene {...VAULT.delegated} />));
    expect(screen.getByText("Votes").parentElement).toHaveTextContent("0x04d1");
    expect(screen.queryByRole("button", { name: /Delegate/ })).not.toBeInTheDocument();
  });

  it("a guest connects; a load shows its shape; a failed read has Retry", async () => {
    const onConnect = vi.fn();
    const onRetry = vi.fn();
    const { unmount } = render(wrap(<VaultScene {...VAULT.guest} onConnect={onConnect} />));
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
    unmount();
    const loading = render(wrap(<VaultScene {...VAULT.loading} />));
    expect(screen.getByRole("status", { name: "Reading the Vault" })).toBeInTheDocument();
    loading.unmount();
    render(wrap(<VaultScene {...VAULT.error} onRetry={onRetry} />));
    expect(screen.getByRole("alert")).toHaveTextContent("The Vault cannot be read");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says a write was refused, with the writer's message, and what a done write moved", () => {
    const { unmount } = render(wrap(<VaultScene {...VAULT.refused} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Deposit refused");
    expect(screen.getByRole("alert")).toHaveTextContent("The exit fee changed: confirm again");
    expect(screen.getByRole("button", { name: "Deposit" })).toBeEnabled();
    unmount();
    const deposited = render(wrap(<VaultScene {...VAULT.deposited} />));
    expect(screen.getByText("Deposited").parentElement).toHaveTextContent("100.00 $TILE in the Vault for 92.23 vPAVED.");
    deposited.unmount();
    render(wrap(<VaultScene {...VAULT.withdrawn} />));
    expect(screen.getByText("Withdrawn").parentElement).toHaveTextContent("500.00 $TILE sent to your wallet");
  });

  it("refuses a withdraw over max_withdraw before any send", () => {
    render(wrap(<VaultScene {...VAULT.overMax} />));
    expect(screen.getByRole("alert")).toHaveTextContent("at most 1,291.12 $TILE now, the exit fee taken. Nothing was sent.");
    expect(screen.getByRole("textbox", { name: "Amount to withdraw" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Withdraw all/ })).toBeEnabled();
  });

  it("sends a player with no $TILE to play", async () => {
    const onPlay = vi.fn();
    render(wrap(<VaultScene {...VAULT.noPaved} onPlay={onPlay} />));
    expect(screen.getByRole("status")).toHaveTextContent("No $TILE in your wallet");
    expect(screen.queryByRole("button", { name: "Deposit" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("says when the economy is not deployed, and offers nothing to send", () => {
    render(wrap(<VaultScene {...VAULT.notDeployed} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Economy not deployed");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("sets the graphics, sound, music, tile preview and placement highlight", async () => {
    const onChange = vi.fn();
    render(wrap(<SettingsScene {...SETTINGS.connected} onChange={onChange} />));
    expect(screen.getByRole("radio", { name: "High" })).toHaveAttribute("data-state", "on");
    await userEvent.click(screen.getByRole("radio", { name: "Low" }));
    expect(onChange).toHaveBeenCalledWith("quality", "low");
    expect(screen.getByRole("switch", { name: "Sound" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Music" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: "Music" }));
    expect(onChange).toHaveBeenCalledWith("music", true);
    await userEvent.click(screen.getByRole("switch", { name: /Tile preview/ }));
    expect(onChange).toHaveBeenCalledWith("tilePreview", false);
    await userEvent.click(screen.getByRole("switch", { name: /Placement highlight/ }));
    expect(onChange).toHaveBeenCalledWith("placementHighlight", false);
  });

  it("shows the connected account, and links to theme and referral", async () => {
    const onDisconnect = vi.fn();
    const onOpenTheme = vi.fn();
    const onOpenReferral = vi.fn();
    render(wrap(<SettingsScene {...SETTINGS.connected} onDisconnect={onDisconnect} onOpenTheme={onOpenTheme} onOpenReferral={onOpenReferral} />));
    const account = screen.getByRole("region", { name: "Account" });
    expect(account).toHaveTextContent("bal7hazar");
    expect(account).toHaveTextContent("Connected 0x05f1…6e7f");
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await userEvent.click(screen.getByRole("button", { name: /Theme.*Default/ }));
    await userEvent.click(screen.getByRole("button", { name: /Referral/ }));
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onOpenTheme).toHaveBeenCalledOnce();
    expect(onOpenReferral).toHaveBeenCalledOnce();
  });

  it("asks a guest to connect", async () => {
    const onConnect = vi.fn();
    render(wrap(<SettingsScene {...SETTINGS.guest} onConnect={onConnect} />));
    expect(screen.getByRole("region", { name: "Account" })).toHaveTextContent("Guest");
    expect(screen.getByRole("button", { name: /Theme.*Forest/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});

describe("Theme", () => {
  it("offers Default and Forest, Snow, Desert and Volcano coming soon, each with its preview", async () => {
    const onSelect = vi.fn();
    render(wrap(<ThemeScene {...THEME.defaultSelected} onSelect={onSelect} />));
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(within(group).getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "true");
    for (const name of ["Snow", "Desert", "Volcano"]) expect(screen.getByRole("radio", { name: `${name}, coming soon` })).toBeDisabled();
    expect(within(screen.getByRole("radio", { name: "Default" })).getAllByRole("img", { name: /^Tile / })).toHaveLength(18);
    await userEvent.click(screen.getByRole("radio", { name: "Forest" }));
    expect(onSelect).toHaveBeenCalledWith("forest");
  });

  it("labels each tinted preview, and not Default's own art", () => {
    render(wrap(<ThemeScene {...THEME.defaultSelected} />));
    expect(within(screen.getByRole("radio", { name: "Default" })).queryByText("Preview")).not.toBeInTheDocument();
    for (const name of ["Forest", "Snow, coming soon", "Desert, coming soon", "Volcano, coming soon"]) {
      expect(within(screen.getByRole("radio", { name })).getByText("Preview")).toBeInTheDocument();
    }
    expect(screen.getAllByTestId("preview-label")).toHaveLength(4);
  });

  it("shows Forest in use", () => {
    render(wrap(<ThemeScene {...THEME.forestSelected} />));
    expect(screen.getByRole("radio", { name: "Forest" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("Quests", () => {
  it("shows the day's rotating dailies and the weeklies with their progress, each with its countdown, and the Achievements tab", async () => {
    const onTab = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.today} onTab={onTab} />));
    const daily = within(screen.getByRole("region", { name: "Daily" }));
    expect(daily.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Daily Run", "Public Works", "Deep Woods", "Strong Day"]);
    expect(daily.getByRole("article", { name: "Daily Run" })).toHaveAttribute("data-state", "complete");
    expect(daily.getByRole("article", { name: "Public Works" })).toHaveAttribute("data-state", "progress");
    for (const name of ["Master Builder", "Into the Woods", "Point Chaser"]) expect(daily.queryByRole("article", { name })).not.toBeInTheDocument(); // v1's: not defined
    // Day 20,740 is offset 1 of the 3-day rotation, so Daily Run and one quest of each family are live: Public Works, Deep Woods, Strong Day.
    expect(daily.queryByRole("article", { name: "Small Works" })).not.toBeInTheDocument();
    expect(daily.queryByRole("article", { name: "Great Works" })).not.toBeInTheDocument();
    expect(daily.getByRole("progressbar", { name: "points: 2,710 of 5,000" })).toBeInTheDocument();
    // 00:00 UTC is 9 hours after the mocks' 15:00.
    expect(daily.getByRole("timer", { name: "Daily ends in 9:00:00" })).toBeInTheDocument();
    const weekly = within(screen.getByRole("region", { name: "Weekly" }));
    expect(weekly.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Weekly Forester", "Weekly Builder", "Weekly Points"]);
    // The week is the definitions': Monday to Sunday UTC, so it ends on Monday 2026-10-19 00:00 UTC, 105 hours on.
    expect(weekly.getByRole("timer", { name: "Weekly ends in 105:00:00" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Quests" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Achievements" }));
    expect(onTab).toHaveBeenCalledWith("achievements");
  });

  it("shows another day's rotation, and a closed day without a countdown", () => {
    render(wrap(<QuestsScene {...QUESTS.allDone} />));
    const daily = within(screen.getByRole("region", { name: "Daily" }));
    expect(daily.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Daily Run", "Small Works", "Woodland Walk", "Warm-Up Score"]);
    expect(screen.getAllByText("Complete")).toHaveLength(4);
    expect(screen.getByText("Closed day")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();
  });

  it("shows a weekly complete, and the daily countdown in its last minutes as a warning", () => {
    const { unmount } = render(wrap(<QuestsScene {...QUESTS.weeklyDone} />));
    expect(within(screen.getByRole("region", { name: "Weekly" })).getByRole("article", { name: "Weekly Forester" })).toHaveAttribute("data-state", "complete");
    unmount();
    render(wrap(<QuestsScene {...QUESTS.endingSoon} />));
    expect(screen.getByRole("timer", { name: "Daily ends in 0:04:00" })).toHaveAttribute("data-state", "warning");
  });

  it("shows a day not played at zero, and a day with no quest", () => {
    const { unmount } = render(wrap(<QuestsScene {...QUESTS.idle} />));
    expect(screen.getAllByText("To do")).toHaveLength(7); // four dailies and the three weeklies
    unmount();
    render(wrap(<QuestsScene {...QUESTS.none} />));
    expect(screen.getByText("No quest this day")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Weekly" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
  });

  it("asks a guest to connect, loads, and fails with a retry", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(wrap(<QuestsScene {...QUESTS.guest} />));
    expect(screen.getByRole("status")).toHaveTextContent("Connect to see your quests");
    unmount();
    const loading = render(wrap(<QuestsScene {...QUESTS.loading} />));
    expect(screen.getByRole("status", { name: "Loading the quests" })).toBeInTheDocument();
    loading.unmount();
    render(wrap(<QuestsScene {...QUESTS.error} onRetry={onRetry} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the quests");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("raises a toast once when a quest completes between two renders, not on a first read or a refresh", async () => {
    toast.dismiss();
    const success = vi.spyOn(toast, "success");
    const scene = (quests: typeof QUESTS_TODAY) => wrap(<><Toaster /><QuestsScene {...QUESTS.today} quests={quests} /></>);
    const { rerender } = render(scene(QUESTS_TODAY_ONE_TO_GO));
    // Daily Run was already complete at the first read: no toast for it.
    await Promise.resolve();
    expect(screen.queryByText(/Quest completed/)).not.toBeInTheDocument();
    rerender(scene(QUESTS_TODAY_COMPLETED));
    expect(await screen.findByText("Quest completed: Public Works")).toBeInTheDocument();
    // A refresh of the same data, and a copy of it, add nothing.
    rerender(scene({ ...QUESTS_TODAY_COMPLETED }));
    rerender(scene(QUESTS_TODAY_COMPLETED));
    expect(screen.getAllByText(/Quest completed/)).toHaveLength(1);
    // Progress that dips and comes back within the interval is not announced a second time.
    rerender(scene(QUESTS_TODAY_ONE_TO_GO));
    rerender(scene(QUESTS_TODAY_COMPLETED));
    expect(screen.getAllByText(/Quest completed/)).toHaveLength(1);
    expect(success).toHaveBeenCalledTimes(1);
    success.mockRestore();
  });

  it("raises no toast on a mere change of day, in either direction", async () => {
    toast.dismiss();
    const success = vi.spyOn(toast, "success");
    const scene = (data: typeof QUESTS_TODAY) => wrap(<><Toaster /><QuestsScene {...QUESTS.today} day={data.day} quests={data} /></>);
    const { rerender } = render(scene(QUESTS_TODAY));
    await Promise.resolve();
    rerender(scene(QUESTS_ALL_DONE));
    rerender(scene(QUESTS_TODAY));
    rerender(scene(QUESTS_ALL_DONE));
    await Promise.resolve();
    expect(success).not.toHaveBeenCalled();
    expect(screen.queryByText(/Quest completed/)).not.toBeInTheDocument();
    success.mockRestore();
  });

  it("treats a return to today as a first read: Weekly Forester 2 of 5 yesterday, 5 of 5 today, no toast", async () => {
    toast.dismiss();
    const success = vi.spyOn(toast, "success");
    const scene = (data: typeof QUESTS_TODAY) => wrap(<><Toaster /><QuestsScene {...QUESTS.today} day={data.day} quests={data} /></>);
    const { rerender } = render(scene(QUESTS_ALL_DONE));
    await Promise.resolve();
    rerender(scene(QUESTS_WEEKLY_DONE));
    await Promise.resolve();
    expect(success).not.toHaveBeenCalled();
    success.mockRestore();
  });

  it("raises the same toast for an achievement earned", async () => {
    toast.dismiss();
    const scene = (achievements: typeof ACHIEVEMENTS_MIXED) => wrap(<><Toaster /><AchievementsScene achievements={achievements} connected /></>);
    const { rerender } = render(scene(ACHIEVEMENTS_MIXED));
    const earned = { ...ACHIEVEMENTS_MIXED, achievements: ACHIEVEMENTS_MIXED.achievements.map((a) => (a.achievementId === 6 ? { ...a, completed: true, completedAt: MOCK_NOW, tasks: a.tasks.map((t) => ({ ...t, count: t.total })) } : a)) };
    rerender(scene(earned));
    expect(await screen.findByText("Achievement earned: Forester")).toBeInTheDocument();
    expect(screen.getByText("+20 pts")).toBeInTheDocument();
  });
});

describe("Achievements", () => {
  it("shows earned, in progress and locked, earned first, and the points", () => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.mixed} />));
    const cards = screen.getAllByRole("article");
    expect(cards.map((c) => c.getAttribute("data-state"))).toEqual(["complete", "complete", "complete", "complete", ...Array(6).fill("progress"), ...Array(6).fill("none")]);
    expect(screen.getAllByText("Earned")).toHaveLength(4);
    expect(screen.getAllByText("Locked")).toHaveLength(6);
    expect(screen.getByRole("region", { name: "Summary" })).toHaveTextContent("4 of 16 earned");
    expect(screen.getByRole("region", { name: "Summary" })).toHaveTextContent("60 / 630 pts");
    // v2a's higher tiers are named, not shown as "Achievement #<id>".
    expect(screen.getByRole("article", { name: "Settler V" })).toBeInTheDocument();
    expect(screen.queryByText(/Achievement #/)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Achievements" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Quests" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["newPlayer", "0 of 16 earned"],
    ["all", "16 of 16 earned"],
  ] as const)("tells the %s state", (state, text) => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS[state]} />));
    expect(screen.getByRole("region", { name: "Summary" })).toHaveTextContent(text);
  });

  it("asks a guest to connect, and loads", () => {
    const { unmount } = render(wrap(<AchievementsScene {...ACHIEVEMENTS.guest} />));
    expect(screen.getByRole("status")).toHaveTextContent("Connect to see your achievements");
    unmount();
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.loading} />));
    expect(screen.getByRole("status", { name: "Loading the achievements" })).toBeInTheDocument();
  });
});

describe("Referral", () => {
  it("shows the link to copy, the 5% share from the split, and what it earned", async () => {
    const onCopy = vi.fn();
    render(wrap(<ReferralScene {...REFERRAL.earned} onCopy={onCopy} />));
    expect(screen.getByLabelText("Your referral link")).toHaveTextContent(REFERRAL_LINK);
    expect(REFERRAL_LINK).toBe(`https://paved.example/?ref=0x${BigInt(PLAYER_ID).toString(16)}`);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(onCopy).toHaveBeenCalledWith(REFERRAL_LINK);
    expect(screen.getByRole("region", { name: "Your link" })).toHaveTextContent("You get 5% of the price of every game and pack");
    expect(screen.getByRole("img", { name: /Referral 5%/ })).toBeInTheDocument();
    // 5% of 6 + 2 + 20 USDC of games, and of a 9 USDC pack.
    const earned = screen.getByRole("region", { name: "Earned" });
    expect(earned).toHaveTextContent("1.85USDC");
    expect(earned).toHaveTextContent("4 purchases");
    const [games, packs] = within(earned).getAllByRole("listitem");
    expect(games).toHaveTextContent(/Challenge games\s*1.40USDC\s*3 games/);
    expect(packs).toHaveTextContent(/Cobbles packs\s*0.45USDC\s*1 pack/);
  });

  it("shares the link where the browser can, and only then", async () => {
    const onShare = vi.fn();
    const { unmount } = render(wrap(<ReferralScene {...REFERRAL.earned} onShare={onShare} />));
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(onShare).toHaveBeenCalledWith(REFERRAL_LINK);
    unmount();
    render(wrap(<ReferralScene {...REFERRAL.earned} />));
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("a failed read of the earnings keeps the link, with Retry", async () => {
    const onRetry = vi.fn();
    render(wrap(<ReferralScene {...REFERRAL.error} onRetry={onRetry} />));
    expect(screen.getByLabelText("Your referral link")).toHaveTextContent(REFERRAL_LINK);
    const earned = screen.getByRole("region", { name: "Earned" });
    expect(within(earned).getByRole("alert")).toHaveTextContent("The earnings cannot be read");
    await userEvent.click(within(earned).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says the link was copied", () => {
    render(wrap(<ReferralScene {...REFERRAL.copied} />));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("says nothing was bought through the link yet, and loads", () => {
    const { unmount } = render(wrap(<ReferralScene {...REFERRAL.none} />));
    expect(screen.getByText(/No purchase through your link yet/)).toBeInTheDocument();
    unmount();
    render(wrap(<ReferralScene {...REFERRAL.loading} />));
    expect(screen.getByRole("status", { name: "Loading the earnings" })).toBeInTheDocument();
  });

  it("asks a guest to connect for a link", () => {
    render(wrap(<ReferralScene {...REFERRAL.guest} />));
    expect(screen.queryByLabelText("Your referral link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Connect to get your link");
  });

  it("shows no share when the economy is not deployed", () => {
    render(wrap(<ReferralScene {...REFERRAL.notDeployed} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Economy not deployed");
    expect(screen.queryByText(/5%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Earned" })).not.toBeInTheDocument();
  });
});

describe("SC2 stories", () => {
  const fixtures = { leaderboard: LEADERBOARD, player: PLAYER_PAGE, vault: VAULT, settings: SETTINGS, theme: THEME, quests: QUESTS, achievements: ACHIEVEMENTS, referral: REFERRAL };
  const names = { leaderboard: "LEADERBOARD", player: "PLAYER_PAGE", vault: "VAULT", settings: "SETTINGS", theme: "THEME", quests: "QUESTS", achievements: "ACHIEVEMENTS", referral: "REFERRAL" } as const;

  // One story per state (the owner, through the PM, 2026-10-14): the viewport is the toolbar's global (VP), never a story each.
  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])("tells every state of %s in one story, at no fixed viewport", (scene) => {
    const text = readFileSync(join(__dirname, `../src/components/scenes/${scene}-scene.stories.tsx`), "utf8");
    const stories = [...text.matchAll(/^export const (\w+): Story = \{ args: (\w+)\.(\w+) \};$/gm)];
    expect(stories.map((m) => m[3]).sort()).toEqual(Object.keys(fixtures[scene]).sort());
    expect(stories.every((m) => m[2] === names[scene])).toBe(true);
    expect(text).not.toMatch(/\bat\(|viewports|globals/);
  });
});
