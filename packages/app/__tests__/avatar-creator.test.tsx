import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AvatarCreatorScene } from "../src/components/scenes/avatar-creator-scene";
import { KING_IDS } from "../src/components/containers/avatar-types";
import { AVATAR_CREATOR } from "../src/mocks/scenes";

// The avatar creator's scene (#626 PR 2) on its mocks: what the player sees in each state, and what each control asks for.

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

describe("AvatarCreatorScene", () => {
  it("shows the traits in use as tabs, the open trait's options with their offers, and the saved avatar's Save done", () => {
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.headwear} />));
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Skin tone", "Hair colour", "Hair", "Beard", "Eyes", "Headwear", "Accessory", "Outfit", "Pauldrons", "Backdrop"]);
    const grid = screen.getByRole("radiogroup", { name: "Headwear" });
    expect(within(grid).getAllByRole("radio")).toHaveLength(11);
    expect(within(grid).getByRole("radio", { name: "Wizard hat, owned" })).toHaveAttribute("aria-checked", "true");
    expect(within(grid).getByRole("radio", { name: "Helmet, free" })).toBeInTheDocument();
    expect(within(grid).getByRole("radio", { name: "Feathered cap, 60 Cobbles" })).toBeInTheDocument();
    // Nothing changed: Save is off, no Buy.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Buy" })).toBeNull();
  });

  it("a priced option tried on: its price and Buy, and Save waits for it", async () => {
    const onBuy = vi.fn();
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.priced} onBuy={onBuy} />));
    expect(screen.getByText("Buy the Feathered cap to save this avatar, or pick a free one.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(onBuy).toHaveBeenCalledWith("headwear", 5);
  });

  it("a tap on a swatch picks it; Randomise, Back to the saved avatar and Save ask the page", async () => {
    const onPick = vi.fn();
    const onSave = vi.fn();
    const onRandomise = vi.fn();
    const onReset = vi.fn();
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.changed} onPick={onPick} onSave={onSave} onRandomise={onRandomise} onReset={onReset} />));
    await userEvent.click(screen.getByRole("radio", { name: "Bald, free" }));
    expect(onPick).toHaveBeenCalledWith("hairStyle", 1);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Randomise" }));
    await userEvent.click(screen.getByRole("button", { name: "Back to the saved avatar" }));
    expect([onSave, onRandomise, onReset].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("another tab shows its trait", async () => {
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.saved} />));
    expect(screen.getByRole("radiogroup", { name: "Skin tone" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Accessory" }));
    const grid = screen.getByRole("radiogroup", { name: "Accessory" });
    expect(within(grid).getByRole("radio", { name: "Glasses, free" })).toHaveAttribute("aria-checked", "true");
    expect(within(grid).getByRole("radio", { name: "Earrings, not for sale" })).toBeInTheDocument();
  });

  it("a legendary item tried on says its rarity beside its name", () => {
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.legendary} />));
    expect(screen.getByText("Legendary")).toBeInTheDocument();
    expect(screen.getByText("Buy the Top hat to save this avatar, or pick a free one.")).toBeInTheDocument();
  });

  it("a seasonal item says when its sale ends; too few Cobbles offers Get Cobbles", () => {
    const { unmount } = render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.priced} />));
    expect(screen.getByText(/^Ends /)).toBeInTheDocument();
    unmount();
    const onBuyCobbles = vi.fn();
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.short} onBuyCobbles={onBuyCobbles} />));
    expect(screen.queryByRole("button", { name: "Buy" })).toBeNull();
    expect(screen.getByRole("button", { name: "Get Cobbles" })).toBeInTheDocument();
  });

  it("the writes on their way: Buy and Save busy, the others wait", () => {
    const { unmount } = render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.buying} />));
    expect(screen.getByRole("button", { name: "Buy" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Randomise" })).toBeDisabled();
    unmount();
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.saving} />));
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-busy", "true");
  });

  it("no part can be picked while a write is on its way (the save's receipt must not meet a newer draft)", async () => {
    for (const state of [AVATAR_CREATOR.saving, AVATAR_CREATOR.buying]) {
      const onPick = vi.fn();
      const { unmount } = render(wrap(<AvatarCreatorScene {...state} onPick={onPick} />));
      const radios = screen.getAllByRole("radio");
      expect(radios.every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
      await userEvent.click(radios[0]!);
      expect(onPick).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("just saved: Saved; a refusal: the error, with Dismiss", async () => {
    const { unmount } = render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.savedNow} />));
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    unmount();
    const onDismissRefusal = vi.fn();
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.refused} onDismissRefusal={onDismissRefusal} />));
    expect(screen.getByText(/price changed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissRefusal).toHaveBeenCalledOnce();
  });

  it("no avatar saved yet: the default head can be saved as it is; once saved, Save waits for a change", async () => {
    const onSave = vi.fn();
    const { unmount } = render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.none} onSave={onSave} />));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
    // Nothing to go back to: the draft is the default.
    expect(screen.getByRole("button", { name: "Back to the saved avatar" })).toBeDisabled();
    unmount();
    const creator = { ...AVATAR_CREATOR.none.creator, unsaved: false };
    render(wrap(<AvatarCreatorScene creator={creator} part="skin" />));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("only the traits in use are tabs", () => {
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.fewParts} />));
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Skin tone", "Hair colour", "Eyes", "Outfit"]);
    expect(AVATAR_CREATOR.fewParts.creator.draft).toEqual(KING_IDS);
  });

  it("a guest connects, a failed read retries, a network without Avatar says so", async () => {
    const onConnect = vi.fn();
    const { unmount } = render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.guest} onConnect={onConnect} />));
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onConnect).toHaveBeenCalledOnce();
    unmount();
    const onRetry = vi.fn();
    const second = render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.error} onRetry={onRetry} />));
    expect(screen.getByText("Your avatar could not be read")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    second.unmount();
    render(wrap(<AvatarCreatorScene {...AVATAR_CREATOR.unavailable} />));
    expect(screen.getByText("Avatars are coming")).toBeInTheDocument();
  });

  it("has a story per state of its mocks", () => {
    const stories = readFileSync(join(__dirname, "../src/components/scenes/avatar-creator-scene.stories.tsx"), "utf8");
    const used = [...stories.matchAll(/AVATAR_CREATOR\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(used)).toEqual(new Set(Object.keys(AVATAR_CREATOR)));
  });
});
