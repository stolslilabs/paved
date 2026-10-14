import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";

/** A path that matches a route pattern: every parameter gets a value. */
const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:(\w+)/g, "1");

describe("app", () => {
  it("renders the home page with the five tabs", async () => {
    render(<App router={createTestRouter("/")} />);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelectorAll("a")).toHaveLength(5);
    for (const label of ["Home", "Ranks", "Quests", "Vault", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps the section 6.1 route map: one placeholder per route", () => {
    expect(PAGES).toHaveLength(17);
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  it.each(PAGES.map((p) => [p.path || "/", p] as const))("renders the placeholder of %s", async (_path, page) => {
    render(<App router={createTestRouter(concrete(page.path))} />);
    expect(await screen.findByRole("heading", { level: 1, name: page.title })).toBeInTheDocument();
    expect(screen.getByTestId("page")).toHaveAttribute("data-path", page.path || "/");
  });

  it("shows the bottom navigation on the tab pages only", async () => {
    const { unmount } = render(<App router={createTestRouter("/vault")} />);
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    unmount();
    render(<App router={createTestRouter("/play")} />);
    await screen.findByRole("heading", { name: "Play" });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});
