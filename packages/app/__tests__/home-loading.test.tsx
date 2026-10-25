import { slow } from "../test-slow";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { FADE_MS, FOG_CLEAR_MS, VillageFog } from "../src/components/elements/village-fog";
import { SETTINGS_KEY } from "../src/data/settings";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { resetVillageArrivalForTests } from "../src/routes/village-arrival";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { mockImplementation } from "./mock-fakes";
import { fakeWallet } from "./wallet-fakes";

// The home's loading (#761) on the mock ledger: a cold arrival under the fog, cleared by the canvas's ready signal. jsdom has no
// WebGL: here it reports some, and the 3D canvas is a stand-in whose buttons are its ready signal and its failure.

vi.mock("../src/lib/webgl", () => ({ hasWebGL: () => true }));
vi.mock("../src/routes/home-canvas", () => ({
  default: ({ onReady, onError }: { onReady?: () => void; onError?: (e: unknown) => void }) => (
    <div data-testid="home-canvas">
      <button type="button" onClick={onReady}>
        Draw village
      </button>
      <button type="button" onClick={() => onError?.(new Error("no context"))}>
        Fail
      </button>
    </div>
  ),
}));

const WAIT = { timeout: slow(8000) };
const fog = () => document.querySelector<HTMLElement>("[data-village-fog]");

async function open() {
  const s = mockImplementation();
  const me = s.sources.signer!.address;
  await s.ledger.writesFor(me).foundFreeVillage();
  const wallet = fakeWallet({ address: me, restored: true });
  wallet.connector.signer = () => s.sources.signer as GameSigner;
  const router = createTestRouter("/");
  render(<App router={router} sources={s.sources} connector={wallet.load} />);
  await screen.findByTestId("home-canvas", {}, WAIT);
  return router;
}

beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/home"), import("../src/routes/home-stage")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
  resetVillageArrivalForTests();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
  resetVillageArrivalForTests();
});

describe("/: a cold arrival under the fog", () => {
  it("keeps the fog over the scene until the canvas says the village is drawn, then clears it", async () => {
    await open();
    expect(fog()).toHaveAttribute("data-village-fog", "fogged");
    expect(fog()).toHaveAttribute("data-arrival", "fog");
    // The fog takes no pointer: the overlays over it stay usable.
    expect(fog()).toHaveClass("pointer-events-none");
    fireEvent.click(screen.getByRole("button", { name: "Draw village" }));
    await waitFor(() => expect(fog()).toHaveAttribute("data-village-fog", "clearing"));
    await waitFor(() => expect(fog()).toBeNull(), { timeout: slow(FOG_CLEAR_MS + 2000) });
  }, slow(30_000));

  it("keeps the overlays usable while the village loads", async () => {
    const router = await open();
    expect(fog()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"), WAIT);
  }, slow(30_000));

  it("fades in a later arrival (Back from a page) instead of the fog", async () => {
    const router = await open();
    fireEvent.click(screen.getByRole("button", { name: "Draw village" }));
    await waitFor(() => expect(fog()).toBeNull(), { timeout: slow(FOG_CLEAR_MS + 2000) });
    await act(() => router.navigate("/settings"));
    await act(() => router.navigate(-1));
    await screen.findByTestId("home-canvas", {}, WAIT);
    expect(fog()).toHaveAttribute("data-arrival", "fade");
  }, slow(30_000));

  it("draws no fog over the plan view (the low quality)", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: "low" }));
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    await s.ledger.writesFor(me).foundFreeVillage();
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    render(<App router={createTestRouter("/")} sources={s.sources} connector={wallet.load} />);
    expect(await screen.findByRole("img", { name: /^Village layout/ }, WAIT)).toBeInTheDocument();
    expect(fog()).toBeNull();
  }, slow(30_000));

  it("lifts the fog with the plan view when the renderer cannot start", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    expect(await screen.findByRole("img", { name: /^Village layout/ }, WAIT)).toBeInTheDocument();
    expect(fog()).toBeNull();
  }, slow(30_000));
});

describe("VillageFog", () => {
  const wrap = (node: React.ReactNode, reducedMotion: "never" | "always" = "never") => (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion={reducedMotion}>{node}</MotionConfig>
    </LazyMotion>
  );

  it("drifts two banks of mist, still under reduced motion", () => {
    const { rerender } = render(wrap(<VillageFog arrival="fog" cleared={false} />));
    const banks = () => [...document.querySelectorAll("[data-fog-bank]")].map((b) => b.getAttribute("data-fog-bank"));
    expect(banks()).toEqual(["drifting", "drifting"]);
    rerender(wrap(<VillageFog arrival="fog" cleared={false} />, "always"));
    expect(banks()).toEqual(["still", "still"]);
  });

  it("is the sky alone on a later arrival, gone a fade after the village is drawn", async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(wrap(<VillageFog arrival="fade" cleared={false} />));
      expect(document.querySelector("[data-fog-bank]")).toBeNull();
      rerender(wrap(<VillageFog arrival="fade" cleared />));
      expect(fog()).toHaveAttribute("data-village-fog", "clearing");
      act(() => vi.advanceTimersByTime(FADE_MS));
      expect(fog()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
