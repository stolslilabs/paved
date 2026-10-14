import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompletionToasts } from "../src/components/containers/completion-toasts";
import { toast } from "../src/components/ui/sonner";
import type { Trackable } from "../src/lib/quest-toasts";

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
});
