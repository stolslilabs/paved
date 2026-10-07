import { afterEach, describe, expect, it, vi } from "vitest";
import { GPU_FLAGS, SMOKE_FLAGS, TRIAL, checkGpu, launchArgs, launchChecked, parseMode, probeGpu } from "../../../scripts/bench/launch";

const M2 = "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)";

describe("parseMode", () => {
  it("is the GPU mode by default", () => {
    expect(parseMode(["bun", "run.ts"])).toEqual({ mode: "gpu", trial: false });
    expect(parseMode(["bun", "run.ts", "--play", "--profiles", "throttled"])).toEqual({ mode: "gpu", trial: false });
  });

  it("keeps --headless as the smoke mode and --trial as a flag", () => {
    expect(parseMode(["--headless"]).mode).toBe("smoke");
    expect(parseMode(["--trial"])).toEqual({ mode: "gpu", trial: true });
  });

  it.each(["--offscreen", "--window-position", "--window-position=-10000,0", "--headed"])("refuses %s", (flag) => {
    expect(() => parseMode(["bun", "run.ts", flag])).toThrow(/no browser window on the Mac/);
  });

  it("refuses --offscreen next to --headless too", () => {
    expect(() => parseMode(["--headless", "--offscreen"])).toThrow(/--offscreen is refused/);
  });

  it("refuses --chromium without --headless", () => {
    expect(() => parseMode(["--chromium", "/usr/bin/chromium"])).toThrow(/use it with --headless/);
    expect(parseMode(["--headless", "--chromium", "/usr/bin/chromium"]).mode).toBe("smoke");
  });

  it.each(["--click", "--play", "--sizes", "--runs", "--duration", "--profiles"])("refuses %s with --trial", (flag) => {
    expect(() => parseMode(["--trial", flag, "1"])).toThrow(new RegExp(`${flag} is refused with it`));
  });

  it("does not take --window (the size) for --window-position", () => {
    expect(parseMode(["--window", "1440x900"]).mode).toBe("gpu");
  });
});

describe("launchArgs", () => {
  it("GPU mode: Metal through ANGLE, GPU forced, no window flag, no SwiftShader", () => {
    const args = launchArgs("gpu", 1440, 900);
    expect(args).toEqual(["--window-size=1440,900", "--enable-precise-memory-info", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]);
    expect(args.join(" ")).not.toMatch(/window-position|swiftshader/i);
    for (const f of GPU_FLAGS) expect(args).toContain(f);
  });

  it("smoke mode: software rendering", () => {
    const args = launchArgs("smoke", 800, 600);
    for (const f of SMOKE_FLAGS) expect(args).toContain(f);
    expect(args).not.toContain("--use-angle=metal");
  });
});

describe("TRIAL", () => {
  it("is one throttled board run of 10 s at 72 tiles", () => {
    expect(TRIAL).toEqual({ kind: "board", size: 72, durationMs: 10_000, profile: "throttled", runs: 1, warmup: 0 });
  });
});

describe("checkGpu", () => {
  it("accepts a hardware renderer with GPU times", () => {
    expect(() => checkGpu({ renderer: M2, gpuMs: [1.2, 1.3], timerQuery: true })).not.toThrow();
    expect(() => checkGpu({ renderer: M2, timerQuery: true })).not.toThrow();
  });

  it.each(["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)", "Google SwiftShader", "swiftshader"])(
    "refuses a software renderer: %s",
    (renderer) => {
      expect(() => checkGpu({ renderer, gpuMs: [1], timerQuery: true })).toThrow(/software rendering/);
    },
  );

  it("refuses a missing renderer string", () => {
    expect(() => checkGpu({ renderer: "" })).toThrow(/no WebGL renderer/);
    expect(() => checkGpu({ renderer: undefined })).toThrow(/no WebGL renderer/);
  });

  it("refuses a run whose gpuMs is null or empty", () => {
    expect(() => checkGpu({ renderer: M2, gpuMs: null })).toThrow(/gpuMs is null/);
    expect(() => checkGpu({ renderer: M2, gpuMs: [] })).toThrow(/gpuMs is null/);
    expect(() => checkGpu({ renderer: M2, gpuMs: undefined })).toThrow(/gpuMs is null/);
  });

  it("refuses a browser without the timer query", () => {
    expect(() => checkGpu({ renderer: M2, timerQuery: false })).toThrow(/no GPU timer query/);
  });
});

describe("probeGpu", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubDocument = (gl: unknown) => vi.stubGlobal("document", { createElement: () => ({ getContext: () => gl }) });

  it("reads the unmasked renderer and the timer query", () => {
    const dbg = { UNMASKED_RENDERER_WEBGL: 1 };
    stubDocument({
      getExtension: (n: string) => (n === "WEBGL_debug_renderer_info" ? dbg : n === "EXT_disjoint_timer_query_webgl2" ? {} : null),
      getParameter: (p: number) => (p === 1 ? M2 : "masked"),
      RENDERER: 0,
    });
    expect(probeGpu()).toEqual({ renderer: M2, timerQuery: true });
  });

  it("reports no timer query, and no WebGL at all", () => {
    stubDocument({ getExtension: () => null, getParameter: () => "WebKit WebGL", RENDERER: 0 });
    expect(probeGpu()).toEqual({ renderer: "WebKit WebGL", timerQuery: false });
    stubDocument(null);
    expect(probeGpu()).toEqual({ renderer: "", timerQuery: false });
  });
});

describe("launchChecked", () => {
  const stubBrowser = (facts: { renderer: string; timerQuery: boolean }) => {
    const calls: string[] = [];
    const browser = {
      newPage: async () => ({
        evaluate: async () => facts,
        close: async () => void calls.push("page.close"),
      }),
      close: async () => void calls.push("browser.close"),
    };
    return { browser, calls };
  };

  it("launches once and returns the browser, open, on a hardware renderer", async () => {
    const { browser, calls } = stubBrowser({ renderer: M2, timerQuery: true });
    const launcher = vi.fn(async () => browser);
    await expect(launchChecked("gpu", launcher)).resolves.toBe(browser);
    expect(launcher).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["page.close"]);
  });

  it("closes the browser and throws on a SwiftShader renderer", async () => {
    const { browser, calls } = stubBrowser({ renderer: "Google SwiftShader", timerQuery: true });
    const launcher = vi.fn(async () => browser);
    await expect(launchChecked("gpu", launcher)).rejects.toThrow(/software rendering/);
    expect(launcher).toHaveBeenCalledTimes(1);
    expect(calls).toContain("browser.close");
  });

  it("closes the browser and throws on a missing timer query", async () => {
    const { browser, calls } = stubBrowser({ renderer: M2, timerQuery: false });
    await expect(launchChecked("gpu", async () => browser)).rejects.toThrow(/no GPU timer query/);
    expect(calls).toContain("browser.close");
  });

  it("skips the check in smoke mode", async () => {
    const { browser, calls } = stubBrowser({ renderer: "Google SwiftShader", timerQuery: false });
    const launcher = vi.fn(async () => browser);
    await expect(launchChecked("smoke", launcher)).resolves.toBe(browser);
    expect(launcher).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });
});
