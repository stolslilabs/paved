import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayScene } from "../src/components/scenes/play-scene";
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import { PLAY, PURCHASE } from "../src/mocks/scenes";
import { wrap, pts } from "./scenes-helpers";
import { flushPending } from "./lazy-chunks";

// Each test's pending timers and effects run before its tree is unmounted (`lazy-chunks.ts`).
afterEach(flushPending);

describe("Play", () => {
  // PLAY-PAGE: the Paved UX Book's "modes", then the owner's asks of 2026-11-06: Ranked before Paid, each mode's rewards (since
  // 2026-11-08 without the gift under them, Story's Cobbles added), no Free Challenge, a Limited section to come. PLAY-MODES
  // (direction C, 2026-11-08): the groups' titles kept for a screen reader only, each card its scene, its icon and its tag.
  it("lists the groups in the owner's order, each mode with its rewards", async () => {
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} onAttack={() => {}} />));
    expect(screen.getByRole("dialog", { name: "Play" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Ranked", "Paid", "Free", "Limited"]);
    const challenge = screen.getByRole("button", { name: /^Challenge/ });
    expect(challenge).toHaveTextContent(/^ChallengeBeat the threshold$/);
    await userEvent.click(challenge);
    expect(onChallenge).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "Rewards: PAVED, XP, chests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Attack/ })).toHaveTextContent("Raid a rival village");
    expect(screen.getByRole("img", { name: "Rewards: crowns, XP, chests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Training/ })).toHaveTextContent("TrainingA full game, just for practice");
    expect(screen.getByRole("button", { name: /^Training/ })).not.toHaveAccessibleName(/Rewards/);
    expect(screen.getByRole("button", { name: /^Story/ })).toHaveTextContent(/^StoryLearn and play fun levels$/);
    expect(screen.getByRole("img", { name: "Rewards: Cobbles, XP, chests" })).toBeInTheDocument();
    // The rewards' icons alone: no gift under them (the owner's ask of 2026-11-08); Story's Cobbles are the token's own icon.
    expect(document.querySelector('img[src*="gift-open"]')).toBeNull();
    expect(screen.getByRole("img", { name: "Rewards: Cobbles, XP, chests" }).querySelector('[data-token="cobbles"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Coming soon" })).toBeDisabled();
    // PLAY-MODES: each card on its mode's scene, its mode's icon over its edge.
    for (const mode of ["attack", "challenge", "training", "story", "puzzle"]) {
      const card = document.querySelector(`[data-mode="${mode}"]`)!;
      expect(card.querySelector(`img[src$="/scene-${mode}.webp"]`), mode).not.toBeNull();
      expect(card.querySelector(`img[src$="/mode-${mode}.webp"]`), mode).not.toBeNull();
    }
    // No price tag, no free game, no Multiplayer.
    expect(screen.queryByText(/USDC|earn PAVED/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Free Challenge/ })).toBeNull();
    expect(screen.queryByText(/Multiplayer/)).toBeNull();
  });

  it("shows a running Challenge's time left and score in place of its rewards, and resumes it", async () => {
    const onResume = vi.fn();
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.running} onResume={onResume} onChallenge={onChallenge} />));
    expect(screen.queryByRole("img", { name: "Rewards: PAVED, XP, chests" })).toBeNull();
    expect(screen.getByText("19h 0m")).toBeInTheDocument();
    expect(screen.getByLabelText(`Score ${pts(PLAY.running.running.score)}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `Resume Challenge #${PLAY.running.running.id}` }));
    expect(onResume).toHaveBeenCalledWith(PLAY.running.running.id);
    expect(onChallenge).not.toHaveBeenCalled();
  });

  it("opens the Challenge and Attack on a tap, no Connect first (NO-GUEST)", async () => {
    const onChallenge = vi.fn();
    const onAttack = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} onAttack={onAttack} />));
    await userEvent.click(screen.getByRole("button", { name: /^Challenge/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Attack/ }));
    expect([onChallenge, onAttack].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    expect(screen.queryByText(/connect/i)).toBeNull();
  });

  // #1041: the rewards are drawn above the card's stretched button (`after:inset-0`); they take no pointer, so a tap on them is the button's.
  // jsdom has no layout: `tapAt` stands in for the browser's hit test, the topmost element under the point that takes pointers.
  it("a tap on Attack's or the Challenge's rewards chooses that mode; Resume stays its own control", async () => {
    const tapAt = async (el: HTMLElement) => {
      const through = el.closest(".pointer-events-none");
      const beneath = through ? through.closest("[data-mode]")!.querySelector<HTMLElement>("button[class*='after:inset-0']")! : el;
      await userEvent.click(beneath);
    };
    const onChallenge = vi.fn();
    const onAttack = vi.fn();
    const { unmount } = render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} onAttack={onAttack} />));
    const prizes = [screen.getByRole("img", { name: "Rewards: crowns, XP, chests" }), screen.getByRole("img", { name: "Rewards: PAVED, XP, chests" })];
    for (const prize of prizes) {
      expect(prize).toHaveClass("pointer-events-none");
      // Each of its images too: none takes a tap of its own.
      for (const img of prize.querySelectorAll<HTMLElement>("*")) expect(img.closest(".pointer-events-none")).toBe(prize);
    }
    await tapAt(prizes[0]!.querySelector("img") ?? prizes[0]!);
    expect(onAttack).toHaveBeenCalledOnce();
    await tapAt(prizes[1]!.querySelector("img") ?? prizes[1]!);
    expect(onChallenge).toHaveBeenCalledOnce();
    unmount();

    const onResume = vi.fn();
    render(wrap(<PlayScene {...PLAY.running} onResume={onResume} onChallenge={onChallenge} />));
    const resume = screen.getByRole("button", { name: `Resume Challenge #${PLAY.running.running.id}` });
    expect(resume.closest(".pointer-events-none")).toBeNull();
    await tapAt(resume);
    expect(onResume).toHaveBeenCalledOnce();
    expect(onChallenge).toHaveBeenCalledOnce();
  });

  it("disables the Challenge while purchases are paused", () => {
    render(wrap(<PlayScene {...PLAY.paused} />));
    expect(screen.getByRole("button", { name: /^Challenge/ })).toBeDisabled();
    expect(screen.getByText("New Challenge games are paused. Training and Story mode stay open.")).toBeInTheDocument();
  });

  // The owner's ask of 2026-11-06: no sheet from the bottom; the stake is a panel of its own in the modes' place, at every width.
  it("opens the stake as the drawer's own panel in the modes' place, its Back to them and its cross out", async () => {
    const onBack = vi.fn();
    const onChallengeBack = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} challenge={<PurchaseScene {...PURCHASE.stake1} />} onBack={onBack} onChallengeBack={onChallengeBack} />));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const panel = screen.getByRole("dialog", { name: "Challenge" });
    expect(panel).toHaveAttribute("data-hud-drawer", "play");
    expect(within(panel).queryByRole("heading", { name: "Paid" })).toBeNull();
    expect(within(panel).getByRole("button", { name: /Confirm, pay .* and play/ })).toBeEnabled();
    await userEvent.click(within(panel).getByRole("button", { name: "Back" }));
    expect(onChallengeBack).toHaveBeenCalledOnce();
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
