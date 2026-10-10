// @vitest-environment jsdom
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NOTICES_PATH, NOTICE_BACKGROUND, NOTICE_LINK, NOTICE_TEXT, WalletNotice } from "../src/components/WalletNotice";

// The notices Cartridge's licence asks of every copy of the client (D-15). `vite build` copies public/ to dist; CI
// builds before it tests, so there dist must hold the file. Locally dist is checked when a build exists.
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const PUBLIC_FILE = at(`../public/${NOTICES_PATH}`);
const DIST_FILE = at(`../dist/${NOTICES_PATH}`);
// The package as @paved/chain installs it (its exports hide package.json from a resolver).
const controllerDir = at("../../chain/node_modules/@cartridge/controller");
const controller = JSON.parse(readFileSync(join(controllerDir, "package.json"), "utf8")) as { version: string };
const LICENSE = readFileSync(join(controllerDir, "LICENSE"), "utf8");

afterEach(cleanup);

describe("third-party notices (D-15)", () => {
  it("name @cartridge/controller at the installed version, Cartridge's copyright, and carry its licence verbatim", () => {
    const notices = readFileSync(PUBLIC_FILE, "utf8");
    expect(notices).toContain(`@cartridge/controller ${controller.version}`);
    expect(notices).toContain("Cartridge Controller is the copyright of Cartridge Gaming Company");
    expect(notices).toContain(LICENSE.trimEnd());
  });

  it("ship in dist", () => {
    if (!process.env.CI && !existsSync(at("../dist/index.html"))) return; // no local build to check
    expect(existsSync(DIST_FILE)).toBe(true);
    expect(readFileSync(DIST_FILE, "utf8")).toBe(readFileSync(PUBLIC_FILE, "utf8"));
  });

  it("are linked from a notice shown on every page", () => {
    render(<WalletNotice base="/" />);
    expect(screen.getByText(/Uses Cartridge Controller, © Cartridge Gaming Company/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Third-party notices" }).getAttribute("href")).toBe("/THIRD_PARTY_NOTICES.txt");
  });

  it("is at body size, visible without hover, with contrast of at least 4.5:1 (D-16)", () => {
    const { container } = render(<WalletNotice base="/" />);
    const footer = container.querySelector("footer")!;
    expect(footer.style.fontSize).toBe("1rem"); // the body font: index.html sets no body size
    expect(footer.style.position).toBe("fixed");
    expect(footer.style.display).not.toBe("none");
    expect(footer.style.opacity).toBe("");
    const link = screen.getByRole("link", { name: "Third-party notices" });
    expect(link.style.fontSize).toBe(""); // inherits 1rem
    expect(link.style.textDecoration).toBe("underline");
    expect(link.getAttribute("tabindex")).toBeNull(); // a plain anchor: in the Tab order
    expect(contrast(NOTICE_TEXT, NOTICE_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(NOTICE_LINK, NOTICE_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it("is mounted once, outside the router, so every page has it", () => {
    const main = readFileSync(at("../src/main.tsx"), "utf8");
    expect(main.match(/<WalletNotice \/>/g)).toHaveLength(1);
    expect(main.indexOf("</BrowserRouter>")).toBeLessThan(main.indexOf("<WalletNotice />"));
  });
});

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
