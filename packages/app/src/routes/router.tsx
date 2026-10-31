import { lazy, type ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, replace, type LoaderFunctionArgs, type RouteObject } from "react-router";
import { HomeLayout } from "./home-layout";
import { PAGE_LOADERS, type PageLoader } from "./page-loaders";
import { PAGES, type PageDef } from "./pages";
import { withRef } from "./ref";
import { RouteError } from "./RouteError";
import { bootScreen, RootLayout } from "./Shell";
import { hasWelcomed } from "./welcomed";

/**
 * One lazy component per loader of `page-loaders.ts`: paths that share a scene (the three boards, the two game-over
 * pages) share the component, so a move between them keeps its state.
 */
const lazies = new Map<PageLoader, ComponentType>();
const pageComponent = (path: string): ComponentType => {
  const load = PAGE_LOADERS[path]!;
  if (!lazies.has(load)) lazies.set(load, lazy(load));
  return lazies.get(load)!;
};
const NotFound = lazy(() => import("./pages/not-found"));
/** A page and its sheets (BACK-RULE #783): its own chunk, as the pages. */
const PageWithSheets = lazy(() => import("./page-sheets"));

/** A redirect that keeps the request's `?ref=`. It replaces the entry, so Back never lands on the old link. */
function to(path: string, request: Request) {
  return replace(withRef(path, new URL(request.url).search));
}

/** `/` is the entry of a first visit: it sends the visitor to the welcome. The flag is read here, at navigation. */
function homeLoader({ request }: LoaderFunctionArgs) {
  return hasWelcomed() ? null : to("/welcome", request);
}

/** The welcome shows once: a returning visitor who opens it goes Home. */
function welcomeLoader({ request }: LoaderFunctionArgs) {
  return hasWelcomed() ? to("/", request) : null;
}

/** The old links of the previous client (section 6.1). */
function gameRedirect({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (params.get("mode") === "challenge" && id && /^\d+$/.test(id)) return to(`/game/${id}`, request);
  if (params.get("mode") === "training") return to("/training", request);
  return to("/", request);
}

/** The Cobble packs left the Challenge's purchase for a page of their own (#621): the old tab's links land there. */
function challengeLoader({ request }: LoaderFunctionArgs) {
  return new URL(request.url).searchParams.get("tab") === "cobbles" ? to("/cobbles", request) : null;
}

const LOADERS: Record<string, RouteObject["loader"]> = { welcome: welcomeLoader, "play/challenge": challengeLoader };

/** A page's route: its entry in `handle` (its tab, its title), its lazy component, its own error boundary. */
function pageRoute(page: PageDef): RouteObject {
  const Page = pageComponent(page.path);
  return { path: page.path, handle: { page }, loader: LOADERS[page.path], element: <Page />, errorElement: <RouteError /> };
}

/**
 * BACK-RULE (#783): a page and the sheets drawn over it (`PageDef.sheet`), one route without a path of its own. The page stays
 * mounted under its sheets (`PageWithSheets`), so a link to a sheet opens it over the page and its close finds the page as it was.
 */
function pageWithSheets(page: PageDef, sheets: readonly PageDef[]): RouteObject {
  const Page = pageComponent(page.path);
  return {
    element: <PageWithSheets page={<Page />} path={page.path} />,
    errorElement: <RouteError />,
    children: [{ path: page.path, handle: { page }, loader: LOADERS[page.path] }, ...sheets.map(pageRoute)],
  };
}

/** The routes of `pages`: each page, its sheets under it. */
function pageRoutes(pages: readonly PageDef[]): RouteObject[] {
  return pages
    .filter((page) => !page.sheet)
    .map((page) => {
      const sheets = pages.filter((s) => s.sheet && s.parent === `/${page.path}`);
      return sheets.length > 0 ? pageWithSheets(page, sheets) : pageRoute(page);
    });
}

const HOME = PAGES.find((page) => page.path === "")!;
const Home = pageComponent(HOME.path);

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    hydrateFallbackElement: bootScreen,
    errorElement: <RouteError />,
    children: [
      {
        // The home's route (DESK-PANELS, #762): `/` and, as its children, the pages of the side panel (`PageDef.panel`), drawn over
        // the home's village from `desktop` and as full pages below it (`HomeLayout`). The welcome's loader is the index's alone.
        id: "home",
        element: <HomeLayout home={<Home />} />,
        errorElement: <RouteError />,
        children: [{ index: true, handle: { page: HOME }, loader: homeLoader }, ...pageRoutes(PAGES.filter((page) => page.panel))],
      },
      ...pageRoutes(PAGES.filter((page) => page.path !== "" && !page.panel)),
      { path: "game", loader: gameRedirect },
      // Missions is one page, today only (#832): the Lifetime tab's link and a day's land on it, as the older names do.
      { path: "missions/lifetime", loader: ({ request }) => to("/missions", request) },
      { path: "missions/:day", loader: ({ request }) => to("/missions", request) },
      { path: "quests/:day?", loader: ({ request }) => to("/missions", request) },
      { path: "achievements", loader: ({ request }) => to("/missions", request) },
      // The defence log became a section of the league (BACK-RULE #783), then its matches (#786): its old link lands there.
      { path: "pvp/defence", loader: ({ request }) => to("/pvp/league", request) },
      { path: "economy", loader: ({ request }) => to("/vault", request) },
      // The ranks left the UI (#623), to come back as leagues: their old links land on Home.
      { path: "leaderboard/:day?", loader: ({ request }) => to("/", request) },
      // A player's link (#952): the home, with that player's public profile open over it (`PLAYER_PARAM`, `player-profile.tsx`; the
      // literal here, so that the module stays out of the first load).
      { path: "player/:id", loader: ({ request, params }) => to(`/?player=${encodeURIComponent(params.id ?? "")}`, request) },
      // The own village is the home (#753): its old link lands there; a visit (`village/:player`) stays.
      { path: "village", loader: ({ request }) => to("/", request) },
      // The scripted tutorial gave way to Story mode (#546), whose first campaign teaches the rules.
      { path: "tutorial", loader: ({ request }) => to("/story", request) },
      { path: "*", element: <NotFound />, errorElement: <RouteError /> },
    ],
  },
];

/**
 * A document's first entry (a typed URL, a link from outside) has no key: React Router names it "default", every document
 * alike. Its own key, written where the router reads it (it keeps the state it finds), keeps what is stored by entry (a tab
 * page's offset, `TabFrame`) apart from one document to the next, and across a reload of the entry.
 */
if (typeof window !== "undefined" && !window.history.state?.key) {
  window.history.replaceState({ ...window.history.state, key: Math.random().toString(36).slice(2, 10) }, "");
}

export const router = createBrowserRouter(routes);

/** A router over a memory history, for the tests. */
export function createTestRouter(initialPath: string, mapRoutes: (routes: RouteObject[]) => RouteObject[] = (r) => r) {
  // A copy, so a test that edits a route leaves the table the next test reads untouched.
  const copy = (rs: RouteObject[]): RouteObject[] => rs.map((r) => (r.children ? { ...r, children: copy(r.children) } : { ...r }) as RouteObject);
  return createMemoryRouter(mapRoutes(copy(routes)), { initialEntries: [initialPath] });
}
