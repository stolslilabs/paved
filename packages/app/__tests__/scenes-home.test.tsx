import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import type { LayoutBoardView } from "../src/components/containers/layout-board";
import { HOME_VILLAGE } from "../src/mocks/village-v2";
import { leagueOf } from "../src/lib/pvp-rules";
import { settleHomeChunks, wrap } from "./scenes-helpers";
import { flushPending } from "./lazy-chunks";

// Each test's pending timers and effects run before its tree is unmounted (`lazy-chunks.ts`).
afterEach(flushPending);

describe("Home (#753): the village with its overlays", () => {
  // Every chunk the scene started loaded before the file ends (`settleHomeChunks`).
  afterAll(settleHomeChunks, slow(30_000));

  // Load-bound: the stage's cold chunk, then ten overlay clicks. Measured 6.7 to 15.4 s on a loaded machine (2026-11-01, after
  // #974's currency icons), past the 15 s default: the ceiling is twice the slowest.
  it("shows the village full screen with the right column, the Chat tab and the mission in progress, the rest the dock's", { timeout: slow(30_000) }, async () => {
    const on = { onPlay: vi.fn(), onChat: vi.fn(), onGuild: vi.fn(), onFriends: vi.fn(), onMissions: vi.fn(), onShop: vi.fn(), onVault: vi.fn(), onTiles: vi.fn(), onLeague: vi.fn(), onSettings: vi.fn(), onEditingChange: vi.fn() };
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...on} />));
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    // The stage (the board, the editor) is its own chunk: it arrives after the overlays. The file's first test imports it cold:
    // 1.5 s on a quiet machine, past the 5 s default on CI once the HUD drew its relief icons (#844).
    expect(await screen.findByRole("img", { name: /^Village layout of \d+ tiles/ }, { timeout: slow(10_000) })).toBeInTheDocument();
    // HOME-EDGES (the Paved UX Book's main screen): the right column's four tiles, their own chunk, Missions and Friends with their counts.
    const column = await screen.findByRole("navigation", { name: "Village" });
    expect(within(column).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Missions, 3 waiting", "Vault", "Friends, 2 waiting", "Tiles"]);
    // The overlays outside the dock (the dock's own are tested below): no Ranking, Shop, Guild, Settings or Play of their own.
    const overlay = (name: string | RegExp) => screen.getAllByRole("button", { name }).find((b) => !b.closest("nav[aria-label=Main]"))!;
    for (const name of ["Ranking", "Shop", "Allegiance, 1 waiting", "Settings", "Play"]) expect(overlay(name), name).toBeUndefined();
    for (const [name, handler] of [
      ["Chat, 3 waiting", on.onChat],
      ["Friends, 2 waiting", on.onFriends],
      ["Missions, 3 waiting", on.onMissions],
      ["Vault", on.onVault],
      ["Tiles", on.onTiles],
      [/^League: /, on.onLeague],
    ] as const) {
      await userEvent.click(overlay(name));
      expect(handler).toHaveBeenCalledTimes(1);
    }
    // The mission in progress opens Missions too: its title and counts in its name.
    await userEvent.click(screen.getByRole("button", { name: "Public Works, 4 of 8" }));
    expect(on.onMissions).toHaveBeenCalledTimes(2);
    // No Edit button (HOME-EDGES, the book's): the village score's capsule opens edit mode.
    expect(screen.queryByRole("button", { name: "Edit village" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Edit village, score/ }));
    expect(on.onEditingChange).toHaveBeenCalledWith(true);
  });

  it("has the dock at every width (#763, HOME-DOCK): Shop, Ranking (no page yet, END-CHEST), Play, Guild, Settings, each reaching its page", async () => {
    const onNavigate = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onNavigate={onNavigate} />));
    // The dock is its own chunk on the home: a stand-in of its size holds its place until it comes.
    const nav = await screen.findByRole("navigation", { name: "Main" });
    // At every width: from `desktop` too, centred (HOME-DOCK); its band takes no tap, only the dock.
    expect(nav.className).not.toContain("desktop:hidden");
    expect(nav.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["pointer-events-none", "[&>*]:pointer-events-auto"]));
    expect(nav.parentElement!.className).not.toContain("desktop:hidden");
    const items = within(nav).getAllByRole("button");
    expect(items.map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Ranking", "Play", "Allegiance, 1 waiting", "Settings"]);
    // No item current on the home; the guild's count on Guild; Ranking opens the Leaderboard (LEADERBOARD-PAGE).
    expect(within(nav).queryByRole("button", { current: "page" })).toBeNull();
    expect(within(within(nav).getByRole("button", { name: "Allegiance, 1 waiting" })).getByText("1")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Ranking" })).not.toHaveAttribute("aria-disabled");
    for (const item of items) await userEvent.click(item);
    expect(onNavigate.mock.calls.map(([tab]) => tab)).toEqual(["shop", "ranking", "play", "guild", "settings"]);
  });

  it("HOME-EDGES: the right column at every width; the Chat tab and the mission stacked at the bottom left, above the dock", async () => {
    const onMissions = vi.fn();
    const onVault = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onMissions={onMissions} onVault={onVault} />));
    // The right column at every width (no `hidden`), centred in the band under the balances; taller than it, it wraps leftwards.
    const column = await screen.findByRole("navigation", { name: "Village" });
    expect(column.className.split(" ")).not.toContain("hidden");
    expect(column.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "flex-wrap-reverse", "content-start", "gap-2"]));
    expect(column.parentElement!.className.split(" ")).toEqual(
      expect.arrayContaining(["right-(--hud-inset-right)", "top-(--right-top)", "bottom-(--right-bottom)", "justify-center-safe", "pointer-events-none", "[&>*]:pointer-events-auto"]),
    );
    // Each button its icon and its name alone (the owner's ask: no asset, no box), on a 64 px square hit box drawing nothing.
    for (const tile of within(column).getAllByRole("button")) {
      expect(tile.className.split(" ")).toContain("size-16");
      expect(tile.className).not.toMatch(/\b(bg|shadow|border|rounded)-/);
      expect(tile.querySelectorAll("img:not([data-slot=ui-icon])")).toHaveLength(0);
    }
    // The left column keeps the capsules and the chips: no Missions or Vault in it any more, clear of the tiles (80 px, 96 from `tablet`).
    const left = (await screen.findByRole("button", { name: /^League: / })).closest<HTMLElement>("[data-slot=scroll-region]")!;
    expect(within(left).queryByRole("button", { name: /^(Missions|Vault)/ })).toBeNull();
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["right-20", "tablet:right-24"]));
    // Settings and Play are the dock's alone, at every width (HOME-DOCK).
    for (const name of ["Settings", "Play"]) expect(screen.getAllByRole("button", { name }).every((b) => b.closest("nav[aria-label=Main]"))).toBe(true);
    // The bottom left (the owner's ask: the mission at the left, just above the dock, as the chat): the Chat tab, the
    // mission, in that order, clear of the dock's measured height below `desktop` and of its crest (the PLAY medallion) on a phone.
    const place = document.querySelector<HTMLElement>("[data-bottom-left]")!;
    expect(place.className).toContain("bottom-[calc(var(--app-nav-h)+0.5rem)]");
    expect(place.style.marginBottom).toBe("var(--dock-crest)");
    const chat = await within(place).findByRole("button", { name: "Chat, 3 waiting" });
    const mission = within(place).getByRole("button", { name: "Public Works, 4 of 8" });
    expect(within(place).queryByRole("button", { name: /^Season/ })).toBeNull();
    expect(chat.compareDocumentPosition(mission) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(mission);
    expect(onMissions).toHaveBeenCalledTimes(1);
    // Its counts close ("4/8", the owner's ask) and its task under the title in place of a bar: the ring tells the progress.
    expect(mission.querySelector("[data-slot=mission-count]")).toHaveTextContent(/^4\/8$/);
    expect(mission).toHaveTextContent("Score roads and cities in a day");
    expect(mission.querySelector(".bg-medal-1")).toBeNull();
    // No HUD frame, no border (the owner's asks): a veil under it, blurred, its edges faded by a mask (jsdom keeps no `mask-image`:
    // the stories show it).
    expect(mission.querySelector("[data-slot=hud-frame]")).toBeNull();
    expect(mission.querySelector("[data-slot=mission-veil]")!.className.split(" ")).toEqual(expect.arrayContaining(["absolute", "-z-10", "backdrop-blur-sm"]));
  });

  it("HOME-EDGES: no mission tab without a mission in progress (none read, every daily done)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} mission={null} />));
    await screen.findByRole("button", { name: "Chat, 3 waiting" });
    expect(screen.queryByRole("button", { name: /^Public Works/ })).toBeNull();
  });

  it("HOME-OVERLAYS (#856, #929, HOME-EDGES): the right column's tiles 8 px apart and centred in its band, the left one's controls 12 px apart at its top; no League in the right column; no Edit button", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.shielded} />));
    await screen.findByRole("button", { name: /^League: / });
    const right = await screen.findByRole("navigation", { name: "Village" });
    const league = screen.getByRole("button", { name: /^League: / });
    const left = league.closest<HTMLElement>("[data-slot=scroll-region]")!;
    expect(right.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "gap-2"]));
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "gap-3"]));
    // HOME-UI-CAPSULES: in it, the crowns', the shield's and the village's capsules stretched to one width, 4 px apart.
    const capsules = league.parentElement!;
    expect(capsules).toHaveAttribute("data-slot", "home-capsules");
    expect(capsules.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "items-stretch", "gap-1"]));
    expect(capsules.parentElement).toBe(left);
    expect(right.parentElement!.className.split(" ")).toContain("justify-center-safe");
    // HOME-STACK (#929): the League control and the village score stacked at the top under the profile (flex's start), at every width.
    expect(left.className.split(" ")).not.toEqual(expect.arrayContaining([expect.stringMatching(/^justify-/)]));
    // Each column's band, measured off its neighbours (the browser's layout, the stories' captures): under the balances and above
    // the bottom row on the right, under the profile and above the bottom left's stack (the dial, Chat, the mission) on the left.
    expect(right.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["top-(--right-top)", "bottom-(--right-bottom)"]));
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["top-(--left-top)", "bottom-(--left-bottom)"]));
    // Taller than its band (shielded, the score unfolded, a short screen), the left column scrolls within it, never over the dial:
    // `ScrollRegion`'s box, its edge hint attached once the stage's chunk is in (the hint marks the axis that scrolls, none here).
    expect(left).toHaveAttribute("data-slot", "scroll-region");
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["scroll-hint", "overflow-y-auto", "overscroll-contain"]));
    // The left column holds the League control, the village score and the shield's capsule, in that order, then the chips.
    await waitFor(() => expect(left.querySelector("[data-slot=shield-plate]")).not.toBeNull());
    const order = [left.querySelector("[data-slot=league-control]"), left.querySelector("[data-slot=village-score]"), left.querySelector("[data-slot=shield-plate]")];
    for (const el of order) expect(el).not.toBeNull();
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const el of order) expect(capsules.contains(el)).toBe(true);
    // No League in the right column (#856): the four tiles only (HOME-DOCK: Chests and Shop are the dock's).
    expect(within(right).queryByRole("button", { name: /^League/ })).toBeNull();
    // No Edit button (HOME-EDGES): the village score's capsule is the way to edit mode; Settings and Play the dock's (HOME-DOCK).
    expect(screen.queryByRole("button", { name: "Edit village" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Edit village, score/ }).closest("[data-slot=village-score]")).not.toBeNull();
  });

  it("HOME-HUD-PADDING: one inset at the top and on both sides, the notch's safe area added to the token, the balances on the profile's painted edge", async () => {
    // The token: the spacing scale's 2 on a phone, its 4 from `tablet`, each edge's safe area added there, never by an element.
    const css = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
    expect(css).toMatch(/--hud-inset: calc\(var\(--spacing\) \* 2\);\s*@media \(width >= 40rem\) \{\s*--hud-inset: calc\(var\(--spacing\) \* 4\);/);
    for (const edge of ["top", "left", "right"]) expect(css).toContain(`--hud-inset-${edge}: calc(var(--hud-inset) + env(safe-area-inset-${edge}));`);
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} chat={3} />));
    const box = document.querySelector<HTMLElement>("[data-slot=home-overlays]")!;
    const classes = (el: Element | null | undefined) => el!.className.split(" ");
    // The top row: the profile and the balances off the top and both sides by the token alone.
    const balances = (await waitFor(() => box.querySelector("[data-slot=home-phone-balances]")!)).parentElement!;
    const row = balances.parentElement!.parentElement!;
    expect(classes(row)).toEqual(expect.arrayContaining(["pt-(--hud-inset-top)", "pr-(--hud-inset-right)", "pl-(--hud-inset-left)"]));
    expect(row.className).not.toMatch(/\b(tablet:)?p[tlrx]?-\d|safe-area/);
    // The phone's plates moved by their art's margin onto the profile's painted edge, only while plates are drawn (a guest's
    // Connect keeps the plain inset) and only below `desktop` (the wrapper is the phone's; the column and the rail stay put). The
    // alignment itself is measured on the painted pixels by the `HudInset*` stories' play (`stories/hud-inset-guide.tsx`).
    const phonePlates = box.querySelector("[data-slot=home-phone-balances]")!;
    expect(classes(phonePlates)).toEqual(expect.arrayContaining(["desktop:hidden", "has-[[data-slot=hud-frame]]:-mt-1.5", "has-[[data-slot=hud-frame]]:-mr-1"]));
    // The capsules on the same painted edge, below `desktop` only.
    expect(classes(box.querySelector("[data-slot=home-capsules]"))).toEqual(expect.arrayContaining(["-ml-0.75", "desktop:ml-0"]));
    expect(balances.className).not.toMatch(/(^|\s)(desktop:)?-m[trxy]?-/);
    expect(classes(balances)).toEqual(expect.arrayContaining(["top-0", "right-0"]));
    // The capsules' column, the mission, the right column and the bottom row on the same sides. The Chat tab alone runs
    // to the screen's edge (the book's), the left safe area inside it.
    expect(classes(box.querySelector("[data-slot=scroll-region]"))).toContain("pl-(--hud-inset-left)");
    const place = box.querySelector<HTMLElement>("[data-bottom-left]")!;
    expect(classes(place)).toContain("left-0");
    const chat = await within(place).findByRole("button", { name: "Chat, 3 waiting" });
    // jsdom drops `env()`: the tab's safe area (its width and padding) is the stories' (HudInsetNotchSideways).
    expect(chat.parentElement).toBe(place);
    expect(classes(within(place).getByRole("button", { name: /^Public Works/ }).parentElement)).toContain("pl-(--hud-inset-left)");
    expect(classes((await screen.findByRole("navigation", { name: "Village" })).parentElement)).toContain("right-(--hud-inset-right)");
    expect(classes(place.parentElement!.nextElementSibling)).toContain("right-(--hud-inset-right)");
  });

  it("HOME-EDGES: Chat a tab on the screen's left edge, Friends a tile of the right column, each with its count; no Social nav (Guild the dock's)", async () => {
    const on = { onChat: vi.fn(), onFriends: vi.fn() };
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...on} />));
    const chat = await screen.findByRole("button", { name: "Chat, 3 waiting" });
    const friends = within(await screen.findByRole("navigation", { name: "Village" })).getByRole("button", { name: "Friends, 2 waiting" });
    expect(screen.queryAllByRole("navigation", { name: "Social" })).toEqual([]);
    expect(screen.queryByRole("button", { name: /^Social/ })).toBeNull();
    // The book's orange tab (kept at the owner's ask), its icon and its count; Friends its icon alone.
    expect(chat.querySelector("img[src*='chat-tab']")).not.toBeNull();
    expect(chat.querySelector("[data-slot=ui-icon][data-icon=chat]")).not.toBeNull();
    expect(within(chat).getByText("3")).toBeInTheDocument();
    expect(friends.querySelector("[data-slot=ui-icon][data-icon=friends]")).not.toBeNull();
    expect(within(friends).getByText("2")).toBeInTheDocument();
    // Off the screen in the Camera mode by their nearest edges (CAMERA-EXPLORE): Chat with the bottom left, Friends with the right column.
    expect(chat.closest("[data-out]")).toHaveAttribute("data-out", "l0");
    expect(friends.closest("[data-out]")).toHaveAttribute("data-out", "r0");
    await userEvent.click(chat);
    await userEvent.click(friends);
    expect(on.onChat).toHaveBeenCalledTimes(1);
    expect(on.onFriends).toHaveBeenCalledTimes(1);
  });

  it("draws the edges' buttons with the HUD's icons (HOME-EDGES); no Edit button; Play is the dock's medallion (HOME-DOCK)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />));
    expect(screen.queryAllByRole("button", { name: "Play" }).filter((b) => !b.closest("nav[aria-label=Main]"))).toEqual([]);
    expect(screen.queryByRole("button", { name: "Edit village" })).toBeNull();
    // The book's art (#844's relief icons gave way to the HUD's): each button's icon a HUD icon, drawn at the first paint of its chunk.
    const column = await screen.findByRole("navigation", { name: "Village" });
    for (const [name, icon] of [
      [/^Missions/, "missions"],
      [/^Vault/, "vault"],
      [/^Friends/, "friends"],
      [/^Tiles/, "tile-stack"],
    ] as const) {
      expect(within(column).getByRole("button", { name }).querySelector(`[data-slot=ui-icon][data-icon=${icon}]`), String(name)).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: /^Chat/ }).querySelector("[data-slot=ui-icon][data-icon=chat]")).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Public Works/ }).querySelector("[data-slot=ui-icon][data-icon=hammer]")).not.toBeNull();
    for (const button of [...within(column).getAllByRole("button"), screen.getByRole("button", { name: /^Chat/ })]) expect(button.querySelector("[data-slot=game-icon]")).toBeNull();
    // The crowns' capsule (HOME-UI-CAPSULES): the HUD's crown, no game icon; the league's crest is the player card's.
    const league = screen.getByRole("button", { name: /^League: / });
    expect(league.querySelectorAll("[data-slot=game-icon]")).toHaveLength(0);
    expect(league.querySelector("[data-slot=ui-icon][data-icon=crown]")).not.toBeNull();
    // The defence log is the league page's: no overlay button. League is labelled plainly, the badge shows which.
    expect(screen.queryByRole("button", { name: /^Defence/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^League,/ })).toBeNull();
  });

  it("shows the League control under the profile: the crown and the crowns, no league name; a tap opens the league (#829)", async () => {
    const onLeague = vi.fn();
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onLeague={onLeague} />));
    const name = leagueOf(1_240).name;
    const standing = await screen.findByRole("button", { name: `League: ${name}, 1,240 crowns` });
    // The crowns in the capsule, the crown capping its left end; the league in its data and its accessible name only.
    expect(standing).toHaveTextContent(/^1,240$/);
    expect(standing).toHaveAttribute("data-league", leagueOf(1_240).id);
    expect(standing).toHaveAttribute("data-tier", leagueOf(1_240).id);
    expect(standing.querySelector("[data-icon=trophy]")).toBeNull();
    expect(standing.querySelector("[data-slot=ui-icon][data-icon=crown]")).not.toBeNull();
    await userEvent.click(standing);
    expect(onLeague).toHaveBeenCalledTimes(1);
    unmount();
    // Before any PvP: Wood with 0 crowns, still the way to the league.
    // Merged over the view's fixture, as the Start story's args are: its own `league: null` wins.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...HOME_VILLAGE.start} onLeague={onLeague} />));
    await userEvent.click(await screen.findByRole("button", { name: `League: ${leagueOf(0).name}, 0 crowns` }));
    expect(onLeague).toHaveBeenCalledTimes(2);
  });

  it("the League control reads Unranked before any crown and any attack (#917)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...HOME_VILLAGE.unranked} />));
    const standing = await screen.findByRole("button", { name: "League: Unranked, 0 crowns" });
    expect(standing).toHaveAttribute("data-tier", "unranked");
  });

  it("carries today's home content as chips: Resume and the spawn pause", async () => {
    const onResume = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.paused} onResume={onResume} />));
    await userEvent.click(screen.getByRole("button", { name: "Resume Challenge #1042" }));
    expect(onResume).toHaveBeenCalledWith(1042);
    expect(screen.getByText("New Challenge games are paused")).toBeInTheDocument();
  });

  it("asks no one to connect (NO-GUEST): a village to look at has no Edit and no guest's line", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} readOnly />));
    expect(screen.queryByText(/guest/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit village" })).not.toBeInTheDocument();
  });

  it("offers Found in Edit's place before the village is founded", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.unfounded} />));
    expect(screen.getByRole("button", { name: "Found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit village" })).not.toBeInTheDocument();
  });

  it("paints the overlays while the village is on its way", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.loading} />));
    // The overlays are there (the right column's Missions, its own chunk, HOME-EDGES); Play is the dock's (its own chunk, HOME-DOCK).
    expect(within(await screen.findByRole("navigation", { name: "Village" })).getByRole("button", { name: /^Missions/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Village layout/ })).not.toBeInTheDocument();
  });

  it("the village score's capsule asks for edit mode; in it, the editor's overlays replace the view's in the same scene", async () => {
    const onEditingChange = vi.fn();
    const { rerender } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onEditingChange={onEditingChange} />));
    await userEvent.click(screen.getByRole("button", { name: /^Edit village, score/ }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} editing onEditingChange={onEditingChange} />));
    // The bar's title: "Edit" on a phone; "Edit village" in the side menu's head from `tablet` (its second word from `desktop`).
    expect(await screen.findByRole("heading", { name: "Edit" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await screen.findByRole("complementary", { name: "Editor" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Village" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument();
    // Edit mode has no bar (#763): the editor's panel takes the bottom.
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    // Nothing changed: Back leaves edit mode at once.
    await userEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it("holds the inventory alone in a phone's bottom sheet, the points at the top left, no tab and no fold (EDIT-VILLAGE)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.editing} />));
    // jsdom has no wide screen: a phone's sheet, the inventory under its title, the slots used in a carved chip under it (TILE-COUNTS).
    const panel = await screen.findByRole("complementary", { name: "Editor" }, { timeout: slow(5000) });
    expect(panel).toHaveAttribute("data-edit-panel", "sheet");
    // The floating bar's title: "Edit" at every phone's width (the owner's ask: room down to 320 px).
    expect(screen.getByRole("heading", { name: "Edit" })).not.toHaveClass("hidden");
    expect(within(panel).getByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    const slots = within(panel).getByRole("img", { name: /^\d+ of \d+ slots used$/ });
    expect(slots.closest('[data-slot="edit-slots"]')).not.toBeNull();
    expect(within(panel).getByRole("heading", { name: "Inventory" }).parentElement).not.toContainElement(slots);
    expect(within(panel).getByRole("region", { name: "Inventory tiles" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: /editor/i })).toBeNull();
    // The points: the live score and its lines, out of the sheet.
    const points = screen.getByRole("region", { name: "Village points" });
    expect(panel).not.toContainElement(points);
    expect(within(points).getByRole("img", { name: /^Score [\d,]+$/ })).toBeInTheDocument();
  });

  it("from tablet, docks the bar in the side menu's head, the drawers' close at its end, the inventory under it (EDIT-VILLAGE, the owner's asks)", async () => {
    // A tablet's window: the tablet's width query matches, not the desktop's.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width: 40rem"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    try {
      render(wrap(<HomeVillageScene {...HOME_VILLAGE.editing} />));
      const panel = await screen.findByRole("complementary", { name: "Editor" }, { timeout: slow(5000) });
      expect(panel).toHaveAttribute("data-edit-panel", "side");
      const bar = screen.getByRole("button", { name: "Leave edit mode" }).closest("[data-edit-bar]")!;
      expect(bar).toHaveAttribute("data-edit-bar", "docked");
      expect(within(bar as HTMLElement).getByRole("heading", { name: "Edit village" })).toBeInTheDocument();
      expect(within(bar as HTMLElement).getByRole("button", { name: /^Save$/ })).toBeInTheDocument();
      // The close last, as the drawers' side panel's: no Back before the title.
      const controls = within(bar as HTMLElement).getAllByRole("button");
      expect(controls[controls.length - 1]).toHaveAccessibleName("Leave edit mode");
      // The drawers' body under their band.
      expect(panel.firstElementChild).toHaveClass("bg-secondary");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("asks before leaving edit mode with changes, and keeps them on Keep editing", async () => {
    const onEditingChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.changed} onEditingChange={onEditingChange} />));
    await userEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    // In the HUD drawers' look (EDIT-VILLAGE): their red close keeps editing, Leave with the way out, nothing else.
    expect(within(dialog).getByRole("button", { name: "Keep editing" }).querySelector("[data-slot=ui-icon][data-icon=close]")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Leave" }).querySelector("[data-slot=ui-icon][data-icon=exit]")).not.toBeNull();
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onEditingChange).not.toHaveBeenCalled();
    // The dialog's exit over, the scene is reachable again.
    await userEvent.click(await screen.findByRole("button", { name: "Leave edit mode" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it("places tiles as the boards (#756): the 3D scene gets the bubble, clear of the bar and the panel; no Discard, Reset all in the bar", async () => {
    const views: LayoutBoardView[] = [];
    const renderCanvas = (view: LayoutBoardView) => {
      views.push(view);
      return <div data-testid="canvas" />;
    };
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.placing} renderCanvas={renderCanvas} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    const view = views[views.length - 1]!;
    // The bubble goes to the scene, by the placed tile: Rotate and Back to the inventory, no Validate, no Cancel for an inventory tile.
    expect(view.bubble).toMatchObject({ cell: { x: view.pending!.x, y: view.pending!.y }, cancelButton: false });
    expect(view.bubble!.onReturn).toBeTypeOf("function");
    expect(view.bubble!.onConfirm).toBeUndefined();
    expect(screen.queryByRole("toolbar", { name: "Tile" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Editor" })).toHaveAttribute("data-bubble-avoid");
    expect(screen.getByRole("button", { name: "Leave edit mode" }).closest("[data-bubble-avoid]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Leave edit mode" }).closest("header")).toContainElement(screen.getByRole("button", { name: /^Hold to erase the layout/ }));
    // Erase and Save painted as the die (EDIT-VILLAGE): the eraser and the floppy disk on the HUD's disc, no Font Awesome glyph.
    expect(screen.getByRole("button", { name: /^Hold to erase the layout/ }).querySelector("[data-slot=ui-icon][data-icon=erase]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).querySelector("[data-slot=ui-icon][data-icon=save]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).querySelector(".fa-floppy-disk, svg")).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    unmount();
    // The plan view keeps the still bubble in the panel.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.placing} />));
    const bubble = await screen.findByRole("toolbar", { name: "Tile" }, { timeout: slow(5000) });
    expect(bubble).toHaveAttribute("data-follows", "hand");
    expect(within(bubble).getByRole("button", { name: "Back to the inventory" })).toBeInTheDocument();
  });
});
