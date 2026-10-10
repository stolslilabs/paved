// @vitest-environment jsdom
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppTree } from "../src/AppTree";
import { AppShell, NOTICES_PATH, NOTICE_BACKGROUND, NOTICE_LINK, NOTICE_TEXT, WalletNotice } from "../src/components/WalletNotice";

// The notices Cartridge's licence asks of every copy of the client (D-15). `vite build` copies public/ to dist; CI
// builds before it tests, so there dist must hold the file. Locally dist is checked when a build exists.
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const PUBLIC_FILE = at(`../public/${NOTICES_PATH}`);
const DIST_FILE = at(`../dist/${NOTICES_PATH}`);
// The package as @paved/chain installs it (its exports hide package.json from a resolver).
const controllerDir = at("../../chain/node_modules/@cartridge/controller");
const controller = JSON.parse(readFileSync(join(controllerDir, "package.json"), "utf8")) as { version: string };
const LICENSE = readFileSync(join(controllerDir, "LICENSE"), "utf8");

// The pages are not under test: stub them so the real App routes render in jsdom.
vi.mock("@paved/ui", () => ({ useUIStore: (select: (s: { loading: boolean }) => unknown) => select({ loading: false }), useGameStore: () => undefined }));
vi.mock("../src/components/ConnectionBanner", () => ({ ConnectionBanner: () => <div role="status">banner</div> }));
vi.mock("../src/pages/Landing", () => ({ LandingPage: () => <main>landing</main> }));
vi.mock("../src/pages/Game", () => ({ GamePage: () => <main>game</main> }));
vi.mock("../src/pages/Leaderboard", () => ({ LeaderboardPage: () => <main>leaderboard</main> }));
vi.mock("../src/pages/Player", () => ({ PlayerPage: () => <main>player</main> }));
vi.mock("../src/pages/Quests", () => ({ QuestsPage: () => <main>quests</main> }));
vi.mock("../src/pages/Economy", () => ({ EconomyPage: () => <main>economy</main> }));

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
    expect(footer.style.position).toBe(""); // in normal flow: reserves its height, covers no page
    expect(footer.style.display).not.toBe("none");
    expect(footer.style.opacity).toBe("");
    const link = screen.getByRole("link", { name: "Third-party notices" });
    expect(link.style.fontSize).toBe(""); // inherits 1rem
    expect(link.style.textDecoration).toBe("underline");
    expect(link.getAttribute("tabindex")).toBeNull(); // a plain anchor: in the Tab order
    expect(contrast(NOTICE_TEXT, NOTICE_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(NOTICE_LINK, NOTICE_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it("is in one column with the connection banner and the app, and nothing else in #root, on every route", () => {
    const Router = ({ route, children }: { route: string; children?: React.ReactNode }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
    for (const [route, page] of [["/", "landing"], ["/game", "game"], ["/economy", "economy"]] as const) {
      const root = document.body.appendChild(document.createElement("div")); // stands for #root
      const { unmount } = render(<AppTree supportsMint={false} Router={({ children }) => <Router route={route}>{children}</Router>} />, { container: root });
      expect(screen.getByText(page)).toBeTruthy();
      expect(screen.getAllByRole("link", { name: "Third-party notices" })).toHaveLength(1);
      expect(root.children).toHaveLength(1); // nothing in-flow beside the column
      const column = root.firstElementChild as HTMLElement;
      expect(column.style.flexDirection).toBe("column");
      expect(column.style.height).toBe("100%");
      const [bannerSlot, area, footer] = Array.from(column.children) as HTMLElement[];
      expect(column.children).toHaveLength(3);
      expect(bannerSlot.style.flex).toBe("0 0 auto"); // flex: none
      expect(bannerSlot.textContent).toBe("banner");
      expect(area.style.flex).toContain("1");
      expect(area.style.minHeight).toBe("0px");
      expect(area.contains(screen.getByText(page))).toBe(true);
      expect(footer.tagName).toBe("FOOTER");
      unmount();
      root.remove();
    }
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
