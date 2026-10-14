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
import { ReferralScene, ago } from "../src/components/scenes/referral-scene";
import { SettingsScene } from "../src/components/scenes/settings-scene";
import { ThemeScene } from "../src/components/scenes/theme-scene";
import { VaultScene } from "../src/components/scenes/vault-scene";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { PAGE } from "../src/mocks/leaderboard";
import { PLAYER_ID, TODAY } from "../src/mocks/players";
import { REFERRAL_LINK } from "../src/mocks/referral";
import { ACHIEVEMENTS, LEADERBOARD, PLAYER_PAGE, QUESTS, REFERRAL, SETTINGS, THEME, VAULT } from "../src/mocks/scenes";
import { VAULT_HELD } from "../src/mocks/vault";

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

  it("reads the Vault's rate as OpenZeppelin's conversion, and bps as a percentage", () => {
    expect(vaultRate(VAULT_HELD.totalAssets, VAULT_HELD.totalSupply)).toBe(1_084_199_999_999_999_999n);
    expect(formatBps(500)).toBe("5%");
    expect(formatBps(7_368)).toBe("73.68%");
  });

  it("says how long ago in its largest unit", () => {
    expect(ago(45 * 60)).toBe("45 min ago");
    expect(ago(7 * 3600 + 59)).toBe("7 h ago");
    expect(ago(2 * DAY + 3600)).toBe("2 d ago");
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
  });

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
    expect(within(position).getByText("Withdrawable now").closest("div")?.parentElement).toHaveTextContent("1,287.89");
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
    expect(screen.getByText(/Uses about/)).toBeInTheDocument();
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
    ["depositing", "deposit"],
    ["withdrawing", "withdraw"],
  ] as const)("is busy while %s", (state) => {
    render(wrap(<VaultScene {...VAULT[state]} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("refuses a withdraw over max_withdraw before any send", () => {
    render(wrap(<VaultScene {...VAULT.overMax} />));
    expect(screen.getByRole("alert")).toHaveTextContent("at most 1,287.89 $TILE now, the exit fee taken. Nothing was sent.");
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

  it("shows Forest in use", () => {
    render(wrap(<ThemeScene {...THEME.forestSelected} />));
    expect(screen.getByRole("radio", { name: "Forest" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("Quests", () => {
  it("shows the day's quests with their progress and state, and the Achievements tab", async () => {
    const onTab = vi.fn();
    render(wrap(<QuestsScene {...QUESTS.today} onTab={onTab} />));
    expect(screen.getByRole("article", { name: "Daily Run" })).toHaveAttribute("data-state", "complete");
    expect(screen.getByRole("article", { name: "Master Builder" })).toHaveAttribute("data-state", "progress");
    expect(screen.getByRole("article", { name: "Into the Woods" })).toHaveAttribute("data-state", "none");
    expect(screen.getByRole("progressbar", { name: "points: 2,710 of 3,000" })).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("To do")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "New quests in 9:00:00" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Quests" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Achievements" }));
    expect(onTab).toHaveBeenCalledWith("achievements");
  });

  it("shows a day with all four complete as closed", () => {
    render(wrap(<QuestsScene {...QUESTS.allDone} />));
    expect(screen.getAllByText("Complete")).toHaveLength(4);
    expect(screen.getByText("Closed day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();
  });

  it("shows a day not played at zero, and a day with no quest", () => {
    const { unmount } = render(wrap(<QuestsScene {...QUESTS.idle} />));
    expect(screen.getAllByText("To do")).toHaveLength(4);
    unmount();
    render(wrap(<QuestsScene {...QUESTS.none} />));
    expect(screen.getByText("No quest this day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
  });

  it("asks a guest to connect, and loads", () => {
    const { unmount } = render(wrap(<QuestsScene {...QUESTS.guest} />));
    expect(screen.getByRole("status")).toHaveTextContent("Connect to see your quests");
    unmount();
    render(wrap(<QuestsScene {...QUESTS.loading} />));
    expect(screen.getByRole("status", { name: "Loading the quests" })).toBeInTheDocument();
  });
});

describe("Achievements", () => {
  it("shows earned, in progress and locked, earned first, and the points", () => {
    render(wrap(<AchievementsScene {...ACHIEVEMENTS.mixed} />));
    const cards = screen.getAllByRole("article");
    expect(cards.map((c) => c.getAttribute("data-state"))).toEqual(["complete", "complete", "complete", "complete", "progress", "progress", "none", "none", "none"]);
    expect(screen.getAllByText("Earned")).toHaveLength(4);
    expect(screen.getAllByText("Locked")).toHaveLength(3);
    expect(screen.getByRole("region", { name: "Summary" })).toHaveTextContent("4 of 9 earned");
    expect(screen.getByRole("region", { name: "Summary" })).toHaveTextContent("60 / 230 pts");
    expect(screen.getByRole("tab", { name: "Achievements" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Quests" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["newPlayer", "0 of 9 earned"],
    ["all", "9 of 9 earned"],
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
    expect(screen.getByRole("region", { name: "Your link" })).toHaveTextContent("You get 5% of the price");
    expect(screen.getByRole("img", { name: /Referral 5%/ })).toBeInTheDocument();
    // 5% of 6 + 2 + 20 + 4 + 10 USDC.
    const earned = screen.getByRole("region", { name: "Earned" });
    expect(earned).toHaveTextContent("2.10USDC");
    expect(earned).toHaveTextContent("9 purchases");
    expect(within(earned).getAllByRole("listitem")).toHaveLength(5);
    expect(within(earned).getByText("2 h ago")).toBeInTheDocument();
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
