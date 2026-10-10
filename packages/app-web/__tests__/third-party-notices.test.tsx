// @vitest-environment jsdom
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NOTICES_PATH, WalletNotice } from "../src/components/WalletNotice";

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
});
