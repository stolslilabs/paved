import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompletionToasts } from "../src/components/containers/completion-toasts";
import { toast } from "../src/components/ui/sonner";
import type { Trackable } from "../src/lib/quest-toasts";
import { completionMemory, useCompletionStore } from "../src/data/completion-memory";

const entry = (completed: boolean): Trackable[] => [{ id: 8, intervalId: 2, completed }];
const describeEntry = () => ({ title: "Weekly Forester", icon: "tree" });

type Props = { entries: Trackable[] | null; scope: number; live: boolean };
const setup = (initial: Props) => renderHook((p: Props) => useCompletionToasts("quest", p.entries, describeEntry, { scope: p.scope, live: p.live }), { initialProps: initial });

afterEach(() => vi.restoreAllMocks());

describe("useCompletionToasts", () => {
  it("toasts when an entry completes inside one scope", () => {
    const success = vi.spyOn(toast, "success");
    const { rerender } = setup({ entries: entry(false), scope: 1, live: true });
    rerender({ entries: entry(true), scope: 1, live: true });
    expect(success).toHaveBeenCalledTimes(1);
  });

  it("does not compare two scopes: the change of scope is a first read", () => {
    const success = vi.spyOn(toast, "success");
    const { rerender } = setup({ entries: entry(false), scope: 1, live: true });
    rerender({ entries: entry(true), scope: 2, live: true });
    expect(success).not.toHaveBeenCalled();
  });

  it("never toasts on a past scope (`live: false`), even when an entry completes between two reads", () => {
    const success = vi.spyOn(toast, "success");
    const { rerender } = setup({ entries: entry(false), scope: 1, live: false });
    rerender({ entries: entry(true), scope: 1, live: false });
    expect(success).not.toHaveBeenCalled();
  });

  it("with a memory above the scene: a remount compares with the last list, and announces nothing twice", () => {
    useCompletionStore.setState({ announced: {}, last: {} });
    const success = vi.spyOn(toast, "success");
    const memory = completionMemory("0xada", "quest");
    const mount = (entries: Trackable[]) =>
      renderHook((p: { entries: Trackable[] }) => useCompletionToasts("quest", p.entries, describeEntry, { scope: 1, memory }), { initialProps: { entries } });
    const first = mount(entry(false));
    first.unmount();
    // Completed while unmounted: announced on return.
    const second = mount(entry(true));
    expect(success).toHaveBeenCalledTimes(1);
    second.unmount();
    // The cache's list, then the fresh one: nothing new.
    const third = mount(entry(true));
    third.rerender({ entries: entry(true) });
    expect(success).toHaveBeenCalledTimes(1);
  });
});
