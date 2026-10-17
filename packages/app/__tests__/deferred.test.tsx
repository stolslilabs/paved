import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDeferred } from "../src/lib/deferred";

describe("useDeferred (BOARD-CHUNK)", () => {
  it("loads nothing until it is wanted, then gives the module", async () => {
    const load = vi.fn(async () => ({ name: "module" }));
    const { result, rerender } = renderHook(({ wanted }) => useDeferred(load, wanted), { initialProps: { wanted: false } });
    expect(load).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
    rerender({ wanted: true });
    await waitFor(() => expect(result.current).toEqual({ name: "module" }));
    rerender({ wanted: false });
    expect(result.current).toEqual({ name: "module" });
    expect(load).toHaveBeenCalledOnce();
  });

  it("a failed load calls onError once, throws nothing, and tries again when it is wanted anew", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("module");
    const onError = vi.fn();
    const { result, rerender } = renderHook(({ wanted }) => useDeferred(load, wanted, onError), { initialProps: { wanted: true } });
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(result.current).toBeNull();
    rerender({ wanted: false });
    rerender({ wanted: true });
    await waitFor(() => expect(result.current).toBe("module"));
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("useDeferred, a module that is a function", () => {
  it("stores a loader's function value, not its result", async () => {
    const fn = vi.fn(() => "called");
    const { result } = renderHook(() => useDeferred(async () => fn, true));
    await waitFor(() => expect(result.current).toBe(fn));
    expect(fn).not.toHaveBeenCalled();
  });
});
