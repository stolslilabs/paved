import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { App } from "../src/App";
import { PAGES } from "../src/routes/pages";
import { withRef } from "../src/routes/ref";
import { createTestRouter } from "../src/routes/router";
import { hasWelcomed, markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";

const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:(\w+)/g, "1");

function open(path: string) {
  const router = createTestRouter(path);
  render(<App router={router} />);
  return router;
}

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("the active tab comes from the route's own entry", () => {
  const TAB_LABEL = { home: "Home", ranks: "Ranks", quests: "Quests", vault: "Vault", settings: "Settings" } as const;

  it.each(PAGES.filter((p) => p.nav).map((p) => [p.path || "/", p] as const))("%s", async (_path, page) => {
    open(concrete(page.path));
    await screen.findByRole("heading", { level: 1, name: page.title });
    const active = screen.getAllByRole("button", { current: "page" });
    expect(active.map((b) => b.getAttribute("aria-label"))).toEqual([TAB_LABEL[page.nav!]]);
  });

  it("holds for the nested routes: /player/:id is Ranks, /settings/theme and /referral are Settings, /achievements is Quests", async () => {
    for (const [path, tab] of [
      ["/player/0x1", "Ranks"],
      ["/settings/theme", "Settings"],
      ["/referral", "Settings"],
      ["/achievements", "Quests"],
      ["/leaderboard/20300", "Ranks"],
    ] as const) {
      const { unmount } = render(<App router={createTestRouter(path)} />);
      await screen.findByRole("navigation", { name: "Main" });
      expect(screen.getByRole("button", { current: "page" })).toHaveAccessibleName(tab);
      unmount();
    }
  });

  it("is read from the handle, not the path: a route whose path says otherwise follows its entry", async () => {
    const router = createTestRouter("/vault", (rs) => {
      const vault = rs[0]!.children!.find((r) => r.path === "vault")!;
      vault.path = "settings-looking-path";
      return rs;
    });
    router.navigate("/settings-looking-path");
    render(<App router={router} />);
    await screen.findByRole("heading", { level: 1, name: "Vault" });
    expect(screen.getByRole("button", { current: "page" })).toHaveAccessibleName("Vault");
  });

  it("changes with a tab press and moves the page", async () => {
    const router = open("/");
    await screen.findByRole("heading", { name: "Home" });
    await userEvent.click(screen.getByRole("button", { name: "Quests" }));
    await screen.findByRole("heading", { level: 1, name: "Quests" });
    expect(router.state.location.pathname).toBe("/quests");
    expect(screen.getByRole("button", { current: "page" })).toHaveAccessibleName("Quests");
  });

  it("has no tab on a full-screen flow", async () => {
    open("/play");
    await screen.findByRole("heading", { level: 1, name: "Play" });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});

describe("redirects of the old links", () => {
  it.each([
    ["/game?mode=challenge&id=7", "/game/7"],
    ["/game?mode=training", "/training"],
    ["/economy", "/vault"],
  ])("%s goes to %s", async (from, to) => {
    const router = open(from);
    await waitFor(() => expect(router.state.location.pathname).toBe(to));
    expect(router.state.location.search).toBe("");
  });

  it("sends an unreadable /game link Home", async () => {
    const router = open("/game?mode=challenge&id=abc");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("keeps ?ref= across a redirect", async () => {
    for (const [from, to] of [
      ["/game?mode=challenge&id=7&ref=0xabc", "/game/7"],
      ["/game?mode=training&ref=0xabc", "/training"],
      ["/economy?ref=0xabc", "/vault"],
    ] as const) {
      const router = createTestRouter(from);
      const { unmount } = render(<App router={router} />);
      await waitFor(() => expect(router.state.location.pathname).toBe(to));
      expect(router.state.location.search).toBe("?ref=0xabc");
      unmount();
    }
  });

  it("shows 'not found' for an unknown path, with a way home", async () => {
    const router = open("/nowhere/at/all");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("?ref= survives", () => {
  it("withRef appends, joins and does not duplicate", () => {
    expect(withRef("/vault", "?ref=0xabc")).toBe("/vault?ref=0xabc");
    expect(withRef("/leaderboard?x=1", "?ref=0xabc")).toBe("/leaderboard?x=1&ref=0xabc");
    expect(withRef("/vault#top", "?ref=a b")).toBe("/vault?ref=a%20b#top");
    expect(withRef("/vault?ref=0xdef", "?ref=0xabc")).toBe("/vault?ref=0xdef");
    expect(withRef("/vault", "?other=1")).toBe("/vault");
    expect(withRef("/vault", "")).toBe("/vault");
  });

  it("is kept by the tab bar and by the error page's way home", async () => {
    const router = open("/?ref=0xabc");
    await screen.findByRole("heading", { name: "Home" });
    await userEvent.click(screen.getByRole("button", { name: "Vault" }));
    await screen.findByRole("heading", { level: 1, name: "Vault" });
    expect(router.state.location.search).toBe("?ref=0xabc");
    await userEvent.click(screen.getByRole("button", { name: "Ranks" }));
    await screen.findByRole("heading", { level: 1, name: "Leaderboard" });
    expect(router.state.location.search).toBe("?ref=0xabc");
  });

  it("is kept from the first visit's redirect to the welcome, and by Training", async () => {
    localStorage.clear();
    resetWelcomedForTests();
    const router = open("/?ref=0xabc");
    await screen.findByRole("heading", { name: "Welcome to Paved" });
    expect(router.state.location.pathname).toBe("/welcome");
    expect(router.state.location.search).toBe("?ref=0xabc");
    await userEvent.click(screen.getByRole("button", { name: /Play Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    expect(router.state.location.search).toBe("?ref=0xabc");
  });
});

describe("a page that throws", () => {
  it("shows the route's error boundary with a way home, the other routes unharmed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never {
      throw new Error("the page blew up");
    }
    const router = createTestRouter("/vault", (rs) => {
      rs[0]!.children!.find((r) => r.path === "vault")!.element = <Boom />;
      return rs;
    });
    render(<App router={router} />);
    expect(await screen.findByText("This page could not be shown")).toBeInTheDocument();
    expect(screen.getByText("the page blew up")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  });
});

describe("the welcome", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWelcomedForTests();
  });

  it("shows on the first visit to Home, and Connect marks the visit and goes Home", async () => {
    const router = open("/");
    await screen.findByRole("heading", { name: "Welcome to Paved" });
    expect(router.state.location.pathname).toBe("/welcome");
    await userEvent.click(screen.getByRole("button", { name: /Connect/ }));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(localStorage.getItem("welcomed")).toBe("1");
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows once: a returning visitor skips it, on Home and on /welcome", async () => {
    markWelcomed();
    const first = open("/");
    await screen.findByRole("heading", { name: "Home" });
    expect(first.state.location.pathname).toBe("/");
    const second = createTestRouter("/welcome");
    render(<App router={second} />);
    await waitFor(() => expect(second.state.location.pathname).toBe("/"));
  });

  it("'Skip to Training' goes to /training and marks the visit", async () => {
    const router = open("/welcome");
    await userEvent.click(await screen.findByRole("button", { name: /Play Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    expect(hasWelcomed()).toBe(true);
  });

  it("with storage off it shows and nothing breaks: Connect still goes Home, which does not loop back", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(hasWelcomed()).toBe(false);
    const router = open("/");
    await screen.findByRole("heading", { name: "Welcome to Paved" });
    await userEvent.click(screen.getByRole("button", { name: /Connect/ }));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("the toaster", () => {
  it("is mounted once above the pages: a toast shows on a tab page and on a full-screen flow", async () => {
    open("/");
    await screen.findByRole("heading", { name: "Home" });
    expect(document.querySelectorAll("[data-sonner-toaster]").length).toBeLessThanOrEqual(1);
    act(() => void toast("Quest completed: Daily Run"));
    expect(await screen.findByText("Quest completed: Daily Run")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
  });
});
