import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Notice } from "../src/components/elements/notice";
import { CopyField } from "../src/components/elements/copy-field";
import { RefusalNotice } from "../src/components/scenes/purchase-scene";
import { ShortAddress } from "../src/components/elements/short-address";
import { stopPageGesture, usePageGestures } from "../src/lib/page-gestures";

// APP-FEEL (P-69): text is not selectable by default, the page does not zoom, the board owns its gestures. vitest runs
// with the package as its working directory.
const read = (path: string) => readFileSync(path, "utf8");
const baseLayer = read("src/styles/theme.css").match(/@layer base \{[\s\S]*?\n\}/)![0];
// Every rule of that selector in the base layer, joined.
const rule = (selector: string) =>
  [...baseLayer.matchAll(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join(" ");

describe("the shell is select-none", () => {
  it("the body is select-none, touch-action manipulation, with no long-press menu", () => {
    const body = rule("body");
    expect(body).toContain("select-none");
    expect(body).toContain("touch-manipulation");
    expect(body).toContain("-webkit-touch-callout: none");
    expect(rule("html")).toContain("-webkit-tap-highlight-color: transparent");
  });

  it("a field opts back in, and the canvas owns its touch", () => {
    expect(rule("input, textarea, [contenteditable=\"true\"]")).toContain("select-text");
    expect(rule("canvas")).toContain("touch-action: none");
    expect(rule("img, svg")).toContain("user-drag: none");
  });

  it("the board routes have no pull-to-refresh or bounce", () => {
    expect(baseLayer).toMatch(/html\[data-board\][^{]*\{[^}]*overscroll-behavior: none/);
  });
});

describe("the viewport meta", () => {
  it("forbids page zoom and covers the notch", () => {
    const doc = new DOMParser().parseFromString(read("index.html"), "text/html");
    const content = doc.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
    expect(content.split(",").map((s) => s.trim())).toEqual(
      expect.arrayContaining(["width=device-width", "initial-scale=1", "maximum-scale=1", "user-scalable=no", "viewport-fit=cover"]),
    );
  });
});

describe("the copy targets opt back in with select-text", () => {
  it("the referral link, a full address, an error detail", () => {
    render(
      <>
        <CopyField value="https://paved.example/?ref=0xabc" label="Your referral link" />
        <ShortAddress address={"0x" + "5f".repeat(32)} />
        <Notice tone="danger" title="Refused">The transaction was reverted: 0xdead</Notice>
      </>,
    );
    expect(screen.getByLabelText("Your referral link").className).toContain("select-text");
    expect(screen.getByText("0x" + "5f".repeat(32)).closest("[title]")!.className).toContain("select-text");
    expect(screen.getByText(/was reverted/).className).toContain("select-text");
  });

  it("the transaction hash of an unknown purchase, and only the hash", () => {
    render(<RefusalNotice refusal={{ kind: "unknown", message: "Purchase sent 2 min ago (0xabc123), outcome unknown." }} />);
    const hash = screen.getByText("0xabc123");
    expect(hash.className).toContain("select-text");
    expect(hash.closest("[role=alert]")!.querySelector("span.opacity-90")!.className).not.toContain("select-text");
  });

  it("an info notice stays select-none", () => {
    render(<Notice title="Heads up">Storage is off.</Notice>);
    expect(screen.getByText("Storage is off.").className).not.toContain("select-text");
  });

  it("select-text appears in these sources and no other (each opt-in is listed in the PR)", () => {
    const dir = resolve("src");
    const found = (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !/\.stories\./.test(f))
      .filter((f) => /\bselect-text\b/.test(read(resolve(dir, f))))
      .map((f) => relative(dir, resolve(dir, f)))
      .sort();
    expect(found).toEqual([
      "components/elements/copy-field.tsx",
      "components/elements/notice.tsx",
      "components/elements/short-address.tsx",
      "components/scenes/purchase-scene.tsx",
      "wallet/notice.tsx",
    ]);
  });
});

describe("no dragging", () => {
  it("every <img> of the app is draggable={false}", () => {
    const dir = resolve("src");
    const offenders = (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => /\.tsx$/.test(f) && !/\.stories\./.test(f))
      .filter((f) => [...read(resolve(dir, f)).matchAll(/<img\b[^>]*>/gs)].some((m) => !m[0].includes("draggable={false}")));
    expect(offenders).toEqual([]);
  });
});

describe("the page's pinch (iOS Safari ignores user-scalable)", () => {
  it("cancels gesturestart and gesturechange while mounted, and stops when unmounted", () => {
    function Probe() {
      usePageGestures();
      return null;
    }
    const { unmount } = render(<Probe />);
    for (const type of ["gesturestart", "gesturechange"]) {
      const event = new Event(type, { cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    unmount();
    const after = new Event("gesturestart", { cancelable: true });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    expect(stopPageGesture).toBeTypeOf("function");
  });
});
