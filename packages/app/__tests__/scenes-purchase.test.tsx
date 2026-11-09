import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PurchaseScene, breakEvenScore } from "../src/components/scenes/purchase-scene";
import { PURCHASE } from "../src/mocks/scenes";
import { wrap, pts } from "./scenes-helpers";

describe("Purchase", () => {
  // PLAY-PAGE, the owner's asks of 2026-11-06: the stake in USDC between the League's arrows, the break-even score and the max gain
  // under it, the reward by score, the split of the USDC, Confirm.
  it("prices the stake in USDC, its boost and split, the 24 h validity and what it can win", async () => {
    const onStakeChange = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.stake3Referred} onStakeChange={onStakeChange} />));
    const stake = screen.getByRole("region", { name: "Stake" });
    expect(within(stake).getByRole("status", { name: "Stake: 6 USDC" })).toBeInTheDocument();
    expect(screen.getByTestId("stake-value")).toHaveTextContent("6");
    expect(screen.getByText("+3%")).toBeInTheDocument();
    // The referrer's address is cut in the middle, whole in its title (WRAP360).
    const referrer = screen.getByTitle("0x0456bb00000000000000000000000000000000000000000000000000000beef");
    expect(referrer).toHaveTextContent("0x0456…beef");
    expect(referrer.parentElement).toHaveTextContent(/^To 0x0456…beef/);
    // split_bps 7,368 / 2,632 / 500 of 6 USDC: the referral comes out of the Vault's part, and the parts shown add up
    // to the price shown (4.42 + 1.28 + 0.30 = 6.00).
    const flow = screen.getByRole("region", { name: "Split" });
    expect(within(flow).getByText("Burned").closest("li")).toHaveTextContent("4.42");
    expect(within(flow).getByText("Vault").closest("li")).toHaveTextContent("1.28");
    expect(within(flow).getByText("Referral").closest("li")).toHaveTextContent("0.30");
    expect(within(flow).getByRole("img", { name: "Burned 73.68%, Vault 21.32%, Referral 5%" })).toBeInTheDocument();
    // The deadline is UTC with its label, under the Paris process zone too, the relative time first.
    const expiry = document.querySelector("time")!;
    expect(expiry).toHaveTextContent("in 24 h · Thu, Oct 15, 15:00 UTC");
    expect(expiry).toHaveAttribute("dateTime", "2026-10-15T15:00:00.000Z");
    // What the table means, out of its box, a line each.
    const rules = within(screen.getByRole("region", { name: "Rewards" })).getByRole("list", { name: "How the reward works" });
    expect(within(rules).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      `Under ${pts(1150)} points, the stake is lost.`,
      expect.stringMatching(/^Estimates: your purchase sets the PAVED per point, and the day's scores set the winning score when it closes \(today's average: [\d,]+\)\.$/),
    ]);
    expect(screen.getByRole("button", { name: "Confirm, pay 6 USDC and play" })).toBeEnabled();
    // The arrows: the value is the scene's (a prop), so each moves one step from 3.
    await userEvent.click(within(stake).getByRole("button", { name: "Raise the stake" }));
    expect(onStakeChange).toHaveBeenLastCalledWith(4);
    await userEvent.click(within(stake).getByRole("button", { name: "Lower the stake" }));
    expect(onStakeChange).toHaveBeenLastCalledWith(2);
  });

  it("stops each arrow at its end: no lower than one stake, no higher than the highest", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    expect(screen.getByRole("button", { name: "Lower the stake" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Raise the stake" })).toBeEnabled();
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    expect(screen.getByRole("status", { name: "Stake: 20 USDC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raise the stake" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lower the stake" })).toBeEnabled();
  });

  // The score whose reward wins the price back at the guard's rate (stake 1: 2 USDC is 160 PAVED at 80 a USDC, R = 113.11 PAVED,
  // c 1.222: R x c x score / 1,150 reaches 160 PAVED at 1,332 points), and the cap's R x H; both tiles alike, score and gain.
  it("shows break even and max gain alike, the score to make and its PAVED, and one PAVED's price in USD", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    const even = breakEvenScore(PURCHASE.stake1.quote, PURCHASE.stake1.reference, PURCHASE.stake1.priceInPaved);
    expect(even).toBe(1332);
    expect(screen.getByRole("group", { name: "Break even" })).toHaveTextContent(new RegExp(`^Break even${pts(1332)}16\\d$`));
    expect(screen.getByRole("group", { name: "Max gain" })).toHaveTextContent(`Max gain${pts(4706)}565`);
    // 80 PAVED a USDC: one PAVED is 0.0125 USDC.
    expect(screen.getByText("$0.0125")).toBeInTheDocument();
  });

  it("says so when even the cap does not win the price back, and waits for the price's worth", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.stake1} priceInPaved={10n ** 24n} />));
    expect(screen.getByRole("group", { name: "Break even" })).toHaveTextContent("Break even——");
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.stake1} priceInPaved={null} />));
    expect(screen.getByRole("group", { name: "Break even" })).toHaveTextContent("Break even……");
    expect(screen.queryByText(/1 PAVED ≈/)).toBeNull();
  });

  it("boosts the burn by 10% at the highest stake", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    expect(screen.getByText("+10%")).toBeInTheDocument();
    expect(screen.getByText(/No referrer: the Vault keeps it/)).toBeInTheDocument();
    const flow = screen.getByRole("region", { name: "Split" });
    expect(within(flow).getByText("Burned").closest("li")).toHaveTextContent("14.73");
    expect(within(flow).getByText("Vault").closest("li")).toHaveTextContent("5.27");
    expect(within(flow).getByText("Referral").closest("li")).toHaveTextContent("0.00");
  });

  it("refuses to pay with too little USDC, or while purchases are paused", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.short} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough USDC");
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeDisabled();
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.paused} />));
    expect(screen.getByText("Purchases paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeDisabled();
  });

  it("is busy while the purchase is on its way", () => {
    render(wrap(<PurchaseScene {...PURCHASE.buying} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toHaveAttribute("aria-busy", "true");
  });

  // #705: what a score earns, not only the score to beat. Stake 1 at the mocks' pool: R = 113.11 PAVED, c 1.222, H 5.
  it("shows the estimated reward by score, from the threshold to the cap", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(table).toHaveAttribute("aria-busy", "false");
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual([
      `${pts(1150)}138.22PAVED`,
      `${pts(1438)}172.84PAVED`,
      `${pts(1725)}207.33PAVED`,
      `${pts(2300)}276.44PAVED`,
      `${pts(4706)}+565.56PAVED`,
    ]);
    // Its meaning sits under its box, not in it.
    expect(table.closest(".drawer-carved")).not.toHaveTextContent(/Estimates/);
    expect(screen.getByRole("list", { name: "How the reward works" })).toHaveTextContent(/^Under .*Estimates: your purchase sets the PAVED per point/);
  });

  it("scales the reward by score with the stake", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("1,505.41");
    expect(within(table).getAllByRole("row").at(-1)).toHaveTextContent("6,159.64");
  });

  it("keeps the rows of the reward by score while its figures wait", () => {
    render(wrap(<PurchaseScene {...PURCHASE.estimating} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(within(table).queryByText("PAVED")).not.toBeInTheDocument();
    // Pay never waits for the estimate.
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeEnabled();
    expect(screen.queryByText("The reward cannot be estimated")).toBeNull();
  });

  it("says why the reward cannot be estimated instead of waiting for ever, with Retry", async () => {
    const onRetryReference = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.estimateFailed} onRetryReference={onRetryReference} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(table).toHaveAttribute("aria-busy", "false");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("—");
    expect(screen.getByText("The reward cannot be estimated")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryReference).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeEnabled();
  });
});
