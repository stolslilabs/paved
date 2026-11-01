import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
import { MissionsScene } from "../src/components/scenes/missions-scene";
import { ReferralScene } from "../src/components/scenes/referral-scene";
import { SettingsScene } from "../src/components/scenes/settings-scene";
import { ThemeScene } from "../src/components/scenes/theme-scene";
import { VaultScene } from "../src/components/scenes/vault-scene";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { PLAYER_ID, TODAY } from "../src/mocks/players";
import { REFERRAL_LINK } from "../src/mocks/referral";
import { MISSIONS, MY_TILES, REFERRAL, SETTINGS, THEME, THEME_SHOP, VAULT } from "../src/mocks/scenes";
import { PREVIEW_WITHDRAW_500, VAULT_HELD } from "../src/mocks/vault";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/** Points as the Score writes them. */
const pts = (n: number) => formatPoints(n);

describe("SC2 helpers", () => {
  it("dates a day id in UTC", () => {
    expect(TODAY).toBe(Math.floor(MOCK_NOW / DAY));
    expect(formatDay(TODAY)).toBe("Wed, Oct 14 UTC");
    expect(formatDay(TODAY - 1)).toBe("Tue, Oct 13 UTC");
  });

  it("parses a typed amount, and refuses what is not one", () => {
    expect(parseUnits("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseUnits(".25", 6)).toBe(250_000n);
    expect(parseUnits("", 18)).toBeNull();
    expect(parseUnits("1.2.3", 18)).toBeNull();
    expect(parseUnits("0.0000001", 6)).toBeNull();
  });

  it("takes the exit fee with V1b's rounding: inside a redeem, on top of a withdraw (vault.cairo:233, :240, :299)", () => {
    // max_withdraw = value - ceil(value x 500 / 10,500), the value 1,355.68... PAVED.
    expect(VAULT_HELD.maxWithdraw).toBe(VAULT_HELD.value - (VAULT_HELD.value * 500n + 10_499n) / 10_500n);
    expect(VAULT_HELD.maxWithdraw).toBe(1_291_127_314_285_714_285_713n);
    // withdraw 500: the shares of 500 + ceil(500 x 500 / 10,000) = 525 PAVED, rounded up.
    expect(PREVIEW_WITHDRAW_500).toBe(484_228_002_213_613_724_406n);
  });

  it("reads the Vault's rate as OpenZeppelin's conversion, and bps as a percentage", () => {
    expect(vaultRate(VAULT_HELD.totalAssets, VAULT_HELD.totalSupply)).toBe(1_084_199_999_999_999_999n);
    expect(formatBps(500)).toBe("5%");
    expect(formatBps(7_368)).toBe("73.68%");
  });

});

describe("Vault", () => {
  it("shows the vPAVED, their value, max_withdraw, the rate and the exit fee", () => {
    render(wrap(<VaultScene {...VAULT.position} />));
    const position = screen.getByRole("region", { name: "Your position" });
    expect(position).toHaveTextContent("1,250.40vPAVED");
    expect(position).toHaveTextContent("1,355.68PAVED");
    expect(within(position).getByText("Withdrawable now").closest("div")?.parentElement).toHaveTextContent("1,291.12");
    expect(within(position).getByText("Rate").closest("div")?.parentElement).toHaveTextContent("1 : 1.0841");
    expect(within(position).getByText("Exit fee").closest("div")?.parentElement).toHaveTextContent("5%");
    // The Vault is the home's overlay's, not the bar's (#763): no item current.
    expect(within(screen.getByRole("navigation", { name: "Main" })).queryByRole("button", { current: "page" })).toBeNull();
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
    // 5 % of 500 PAVED, on top.
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
    expect(screen.getByText("Deposited").parentElement).toHaveTextContent("100.00 PAVED in the Vault for 92.23 vPAVED.");
    deposited.unmount();
    render(wrap(<VaultScene {...VAULT.withdrawn} />));
    expect(screen.getByText("Withdrawn").parentElement).toHaveTextContent("500.00 PAVED sent to your wallet");
  });

  it("refuses a withdraw over max_withdraw before any send", () => {
    render(wrap(<VaultScene {...VAULT.overMax} />));
    expect(screen.getByRole("alert")).toHaveTextContent("at most 1,291.12 PAVED now, the exit fee taken. Nothing was sent.");
    expect(screen.getByRole("textbox", { name: "Amount to withdraw" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Withdraw all/ })).toBeEnabled();
  });

  it("sends a player with no PAVED to play", async () => {
    const onPlay = vi.fn();
    render(wrap(<VaultScene {...VAULT.noPaved} onPlay={onPlay} />));
    expect(screen.getByRole("status")).toHaveTextContent("No PAVED in your wallet");
    expect(screen.queryByRole("button", { name: "Deposit" })).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Play" }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("says when the economy is not deployed, and offers nothing to send", () => {
    render(wrap(<VaultScene {...VAULT.notDeployed} />));
    expect(screen.getByText("Economy not deployed")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("sets the graphics, the day and night cycle, the volumes, tile preview and placement highlight", async () => {
    const onChange = vi.fn();
    render(wrap(<SettingsScene {...SETTINGS.connected} onChange={onChange} />));
    expect(screen.getByRole("radio", { name: "High" })).toHaveAttribute("data-state", "on");
    await userEvent.click(screen.getByRole("radio", { name: "Low" }));
    expect(onChange).toHaveBeenCalledWith("quality", "low");
    expect(screen.getByRole("switch", { name: /Day\/night cycle/ })).toBeChecked();
    await userEvent.click(screen.getByRole("switch", { name: /Day\/night cycle/ }));
    expect(onChange).toHaveBeenCalledWith("dayNight", false);
    const onVolumeChange = vi.fn();
    cleanup();
    render(wrap(<SettingsScene {...SETTINGS.connected} onChange={onChange} onVolumeChange={onVolumeChange} />));
    await userEvent.click(screen.getByRole("button", { name: "Mute music" }));
    expect(onVolumeChange).toHaveBeenCalledWith("music", 0);
    screen.getByRole("slider", { name: "Sound effects volume" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onVolumeChange).toHaveBeenCalledWith("sfx", 0.71);
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
    await userEvent.click(screen.getByRole("button", { name: /^Themes/ }));
    await userEvent.click(screen.getByRole("button", { name: /Referral/ }));
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onOpenTheme).toHaveBeenCalledOnce();
    expect(onOpenReferral).toHaveBeenCalledOnce();
  });

  it("asks a guest to connect", async () => {
    const onConnect = vi.fn();
    render(wrap(<SettingsScene {...SETTINGS.guest} onConnect={onConnect} />));
    expect(screen.getByRole("region", { name: "Account" })).toHaveTextContent("Guest");
    expect(screen.getByRole("button", { name: /^Themes/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});

describe("Theme", () => {
  const card = (name: string) => screen.getByRole("article", { name });

  it("shows each theme with its real tiles: Default and Forest to use, Snow, Desert and Volcano coming soon under a blur", () => {
    const { container } = render(wrap(<ThemeScene {...THEME.mixed} />));
    expect(within(screen.getByRole("region", { name: "Themes" })).getAllByRole("article")).toHaveLength(5);
    // The covers are the build-time renders, never tinted chips.
    expect(within(card("Forest")).getByRole("img", { name: "Forest: a few of its tiles" })).toHaveAttribute("src", expect.stringMatching(/\/renders\/cover\.1\.[0-9a-f]{10}\.webp$/));
    expect(container.querySelector("[style*=filter]")).toBeNull();
    for (const name of ["Snow", "Desert", "Volcano"]) {
      expect(within(card(name)).getByText("Coming soon")).toBeInTheDocument();
      expect(within(card(name)).queryByRole("button")).not.toBeInTheDocument();
      expect(within(card(name)).queryByRole("img")).not.toBeInTheDocument();
    }
    expect(container.querySelectorAll("img.blur-xl")).toHaveLength(3);
    expect(card("Forest")).toHaveTextContent("4 / 19 tiles");
    expect(card("Default")).toHaveTextContent("19 / 19 tiles");
  });

  it("uses a theme in one write when no tile-by-tile choice is lost", async () => {
    const onUse = vi.fn();
    render(wrap(<ThemeScene {...THEME.forestInUse} onUse={onUse} />));
    expect(within(card("Forest")).getByRole("button", { name: "Forest in use" })).toBeDisabled();
    await userEvent.click(within(card("Default")).getByRole("button", { name: "Use Default" }));
    expect(onUse).toHaveBeenCalledWith("default", { 7: 0, 8: 0, 10: 0, 13: 0 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks first when using a theme replaces a tile-by-tile mix", async () => {
    const onUse = vi.fn();
    render(wrap(<ThemeScene {...THEME.mixed} onUse={onUse} />));
    expect(screen.getByRole("button", { name: /My tiles/ })).toHaveTextContent("Your own mix");
    await userEvent.click(within(card("Forest")).getByRole("button", { name: "Use Forest" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This changes 2 tiles");
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep my mix" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onUse).not.toHaveBeenCalled();
    await userEvent.click(within(card("Forest")).getByRole("button", { name: "Use Forest" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Use Forest" }));
    expect(onUse).toHaveBeenCalledWith("forest", { 7: 1, 8: 1 });
  });

  it("with nothing owned, Default is in use and Forest's shop says Buy tiles", async () => {
    const onOpen = vi.fn();
    render(wrap(<ThemeScene {...THEME.defaultInUse} onOpen={onOpen} />));
    expect(within(card("Default")).getByRole("button", { name: "Default in use" })).toBeDisabled();
    expect(within(card("Forest")).getByRole("button", { name: "Use Forest" })).toBeDisabled();
    await userEvent.click(within(card("Forest")).getByRole("button", { name: "Forest tiles" }));
    expect(onOpen).toHaveBeenCalledWith("forest");
    expect(within(card("Default")).queryByRole("button", { name: "Default tiles" })).not.toBeInTheDocument();
  });

  it("shows a write on its way, the other Use buttons waiting, and a refusal", () => {
    const { unmount } = render(wrap(<ThemeScene {...THEME.applying} />));
    expect(within(card("Forest")).getByRole("button", { name: "Use Forest" })).toHaveAttribute("aria-busy", "true");
    expect(within(card("Default")).getByRole("button", { name: "Use Default" })).toBeDisabled();
    unmount();
    render(wrap(<ThemeScene {...THEME.refused} />));
    expect(screen.getByText(/is not yours/)).toBeInTheDocument();
  });

  it("asks a guest to connect, the covers still shown", async () => {
    const onConnect = vi.fn();
    render(wrap(<ThemeScene {...THEME.guest} onConnect={onConnect} />));
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(within(card("Forest")).getByRole("button", { name: "Use Forest" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /My tiles/ })).not.toBeInTheDocument();
  });
});

describe("Missions (#832)", () => {
  const card = () => within(screen.getByRole("region", { name: "Selected mission" }));
  const limited = () => within(screen.getByRole("region", { name: "Limited" }));
  const lifetime = () => within(screen.getByRole("region", { name: /^Lifetime/ }));
  const names = (region: ReturnType<typeof within>) => region.getAllByRole("button").map((b) => b.getAttribute("aria-label"));

  it("shows the selected mission's card, then the Limited icons (Daily, Weekly, each with its countdown and its bonus), then the Lifetime ones", () => {
    render(wrap(<MissionsScene {...MISSIONS.daily} />));
    const main = screen.getByRole("main");
    const order = [...main.querySelectorAll("section[aria-label], section[aria-labelledby]")].filter((el) => el.parentElement === main).map((el) => el.getAttribute("aria-label") ?? el.getAttribute("aria-labelledby"));
    expect(order).toEqual(["Selected mission", "missions-limited", "missions-lifetime"]);
    const daily = within(limited().getByRole("region", { name: /^Daily/ }));
    const weekly = within(limited().getByRole("region", { name: /^Weekly/ }));
    // Today's rotation (offset 1): Daily Run, Public Works, Deep Woods, Strong Day and Busy Day, five dailies; no bonus for the day (#869).
    expect(names(daily)).toEqual(["Daily Run: Done", "Public Works: In progress", "Deep Woods: In progress", "Strong Day: In progress", "Busy Day: In progress"]);
    expect(names(weekly)).toEqual(["Weekly Forester: In progress", "Weekly Builder: In progress", "Weekly Points: In progress", "Weekly bonus: To do"]);
    expect(daily.getByRole("timer", { name: "Daily missions reset in 9:00:00" })).toBeInTheDocument();
    expect(weekly.getByRole("timer", { name: "Weekly missions reset in 105:00:00" })).toBeInTheDocument();
    // A daily pays nothing on its own (#869): no Cobbles under its icon. A claimable one glows, its Cobbles under its icon.
    for (const icon of daily.getAllByRole("button")) expect(within(icon).queryByRole("img", { name: /Cobbles/ })).toBeNull();
    expect(lifetime().getByRole("button", { name: "Settler II: Cobbles to claim" })).toHaveAttribute("data-state", "claimable");
    expect(within(lifetime().getByRole("button", { name: /^Settler II:/ })).getByRole("img", { name: "+20 Cobbles" })).toBeInTheDocument();
    expect(within(weekly.getByRole("button", { name: /^Weekly Forester/ })).getByRole("img", { name: "+15 Cobbles" })).toBeInTheDocument();
    expect(names(lifetime())).toHaveLength(16);
    expect(lifetime().getByRole("heading", { level: 2 })).toHaveTextContent("Lifetime4/16");
    // Today only, Cobbles only: no day picker, no free game, no tabs.
    expect(screen.queryByRole("button", { name: "Previous day" })).not.toBeInTheDocument();
    expect(screen.queryByText(/free game/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    // Missions are the home's overlay's, not the bar's (#763): no item current.
    expect(within(screen.getByRole("navigation", { name: "Main" })).queryByRole("button", { current: "page" })).toBeNull();
  });

  it("puts the day's bar above the Daily icons: a step per daily done, the milestones claimed from it (#869)", async () => {
    const onClaimMilestone = vi.fn();
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.milestonesTwo} onClaimMilestone={onClaimMilestone} />));
    const daily = () => within(limited().getByRole("region", { name: /^Daily/ }));
    const bar = daily().getByRole("progressbar", { name: "Dailies done today" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    // Above the icons.
    expect(bar.compareDocumentPosition(daily().getByRole("button", { name: /^Daily Run:/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(daily().getByRole("img", { name: "10 Cobbles at 3 dailies done" })).toBeInTheDocument();
    // The weekly row has none.
    expect(within(limited().getByRole("region", { name: /^Weekly/ })).queryByRole("progressbar")).not.toBeInTheDocument();
    unmount();
    const three = render(wrap(<MissionsScene {...MISSIONS.milestoneThree} onClaimMilestone={onClaimMilestone} />));
    await userEvent.click(daily().getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" }));
    expect(onClaimMilestone).toHaveBeenCalledExactlyOnceWith(0);
    three.unmount();
    const busy = render(wrap(<MissionsScene {...MISSIONS.milestoneThree} claiming="achievement:3" />));
    // Another claim on its way: the milestone waits.
    expect(daily().getByRole("button", { name: "Claim 10 Cobbles: 3 dailies done" })).toBeDisabled();
    busy.unmount();
    const five = render(wrap(<MissionsScene {...MISSIONS.milestoneFive} />));
    expect(daily().getByRole("img", { name: "10 Cobbles claimed: 3 dailies done" })).toBeInTheDocument();
    expect(daily().getByRole("button", { name: "Claim 15 Cobbles: 5 dailies done" })).toBeEnabled();
    five.unmount();
    // The claim landed: the gift held open at its reveal, its Cobbles above it.
    const opening = render(wrap(<MissionsScene {...MISSIONS.milestoneOpening} />));
    expect(daily().getByRole("img", { name: "10 Cobbles claimed: 3 dailies done" })).toHaveAttribute("data-opening");
    expect(document.querySelector('[data-reveal="3"]')).not.toBeNull();
    opening.unmount();
    render(wrap(<MissionsScene {...MISSIONS.milestonesAllClaimed} />));
    expect(daily().getAllByRole("img", { name: /Cobbles claimed/ })).toHaveLength(2);
    expect(daily().getByRole("progressbar")).toHaveAttribute("aria-valuenow", "5");
  });

  it("selects the first mission not done on arrival: Daily, then Weekly, then Lifetime", () => {
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.daily} />));
    // Daily Run is done: Public Works is the first not done.
    expect(card().getByRole("article")).toHaveAccessibleName("Public Works");
    expect(card().getByRole("article")).toHaveTextContent("Daily");
    expect(card().getByRole("progressbar", { name: "roads and cities scored: 4 of 8" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Public Works: In progress" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    unmount();
    // With everything done, the first one.
    render(wrap(<MissionsScene {...MISSIONS.allDone} />));
    expect(card().getByRole("article")).toHaveAccessibleName("Daily Run");
    // A daily has no Cobbles of its own (#869): nothing to claim on its card.
    expect(card().getAllByText(/^Done/).length).toBeGreaterThan(0);
    expect(card().queryByRole("button")).not.toBeInTheDocument();
  });

  it("a tap on an icon updates the card, and rings that icon alone", async () => {
    render(wrap(<MissionsScene {...MISSIONS.daily} />));
    await userEvent.click(screen.getByRole("button", { name: /^Settler III/ }));
    expect(card().getByRole("article")).toHaveAccessibleName("Settler III");
    expect(card().getByRole("article")).toHaveTextContent("Lifetime");
    expect(screen.getByRole("button", { name: /^Settler III/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Public Works/ })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: /^Weekly Builder/ }));
    expect(card().getByRole("article")).toHaveAccessibleName("Weekly Builder");
    expect(card().getByText(/resets Monday/)).toBeInTheDocument();
  });

  it("opens on the mission asked for: a lifetime one, a claim, the week's bonus", () => {
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.lifetime} />));
    expect(card().getByRole("article")).toHaveAccessibleName("Settler III");
    unmount();
    const claim = render(wrap(<MissionsScene {...MISSIONS.claim} />));
    expect(card().getByRole("button", { name: "Claim 20 Cobbles: Settler II" })).toBeEnabled();
    claim.unmount();
    render(wrap(<MissionsScene {...MISSIONS.weekBonus} />));
    expect(card().getByRole("article")).toHaveAccessibleName("Weekly bonus");
    expect(card().getByRole("button", { name: "Claim 60 Cobbles: Weekly bonus" })).toBeEnabled();
  });

  it("shows the Daily countdown in its last minutes as a warning, a new player's locked missions, and a day with no limited mission", () => {
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.endingSoon} />));
    expect(screen.getByRole("timer", { name: "Daily missions reset in 0:04:00" })).toHaveAttribute("data-state", "warning");
    unmount();
    const fresh = render(wrap(<MissionsScene {...MISSIONS.newPlayer} />));
    expect(names(lifetime()).every((n) => n?.endsWith(": Locked"))).toBe(true);
    expect(card().getByRole("article")).toHaveAccessibleName("Daily Run");
    fresh.unmount();
    render(wrap(<MissionsScene {...MISSIONS.noQuest} />));
    expect(screen.getByText("No limited mission live today.")).toBeInTheDocument();
    // The first lifetime mission not done is selected then.
    expect(card().getByRole("article")).toHaveAccessibleName("Settler III");
  });

  it("asks a guest to connect, loads, and fails with a retry", async () => {
    const onRetry = vi.fn();
    const { unmount } = render(wrap(<MissionsScene {...MISSIONS.guest} />));
    expect(screen.getByRole("status")).toHaveTextContent("Connect to see your missions");
    unmount();
    const loading = render(wrap(<MissionsScene {...MISSIONS.loading} />));
    expect(screen.getByRole("status", { name: "Loading the missions" })).toBeInTheDocument();
    loading.unmount();
    render(wrap(<MissionsScene {...MISSIONS.failed} onRetry={onRetry} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the missions");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
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
    expect(screen.getByText("Economy not deployed")).toBeInTheDocument();
    expect(screen.queryByText(/5%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Earned" })).not.toBeInTheDocument();
  });
});

describe("SC2 stories", () => {
  const fixtures = { vault: VAULT, settings: SETTINGS, theme: THEME, "theme-shop": THEME_SHOP, "my-tiles": MY_TILES, missions: MISSIONS, referral: REFERRAL };
  const names = { vault: "VAULT", settings: "SETTINGS", theme: "THEME", "theme-shop": "THEME_SHOP", "my-tiles": "MY_TILES", missions: "MISSIONS", referral: "REFERRAL" } as const;

  // One story per state (the owner, through the PM, 2026-10-14): the viewport is the toolbar's global (VP), never a story each.
  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])("tells every state of %s in one story, at no fixed viewport", (scene) => {
    const text = readFileSync(join(__dirname, `../src/components/scenes/${scene}-scene.stories.tsx`), "utf8");
    const stories = [...text.matchAll(/^export const (\w+): Story = \{ args: (\w+)\.(\w+) \};$/gm)];
    expect(stories.map((m) => m[3]).sort()).toEqual(Object.keys(fixtures[scene]).sort());
    expect(stories.every((m) => m[2] === names[scene])).toBe(true);
    expect(text).not.toMatch(/\bat\(|viewports|globals/);
  });
});
