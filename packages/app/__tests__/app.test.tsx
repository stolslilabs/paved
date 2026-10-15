import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";

/** A path that matches a route pattern: every parameter gets a value. */
const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:(\w+)/g, "1");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
const firstVisit = () => {
  localStorage.clear();
  resetWelcomedForTests();
};
afterEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
});

describe("app", () => {
  it("renders the home page with the five tabs", async () => {
    render(<App router={createTestRouter("/")} />);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelectorAll("button")).toHaveLength(5);
    for (const label of ["Home", "Ranks", "Quests", "Vault", "Settings"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps the section 6.1 route map: 17 pages, each path once", () => {
    expect(PAGES).toHaveLength(17);
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  it.each(PAGES.filter((p) => p.path !== "welcome").map((p) => [p.path || "/", p] as const))(
    "renders %s in the layout of its route",
    async (_path, page) => {
      render(<App router={createTestRouter(concrete(page.path))} />);
      expect(await screen.findByRole("heading", { level: 1, name: page.title })).toBeInTheDocument();
      expect(screen.getByTestId("page")).toHaveAttribute("data-path", page.path || "/");
      // Tab pages carry the navigation, full-screen flows the top bar's Back: never both, never neither.
      expect(screen.queryByRole("navigation", { name: "Main" }) !== null).toBe(page.nav !== null);
      expect(screen.queryByRole("button", { name: "Back" }) !== null).toBe(page.nav === null);
    },
  );

  it("renders the welcome scene on /welcome for a first visit", async () => {
    firstVisit();
    render(<App router={createTestRouter("/welcome")} />);
    expect(await screen.findByRole("heading", { name: "Welcome to Paved" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("shows the loading scene as the boot screen, until the entry route has loaded", () => {
    render(<App router={createTestRouter("/")} />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
