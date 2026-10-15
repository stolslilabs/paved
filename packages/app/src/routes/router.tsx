import { lazy, type ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, redirect, type LoaderFunctionArgs, type RouteObject } from "react-router";
import { PAGES } from "./pages";
import { withRef } from "./ref";
import { RouteError } from "./RouteError";
import { bootScreen, RootLayout } from "./Shell";
import { hasWelcomed } from "./welcomed";

/**
 * One lazy module per scene: a page's code is fetched when its route is first visited, so none of it is in the first
 * bundle. A wiring PR changes the module's body, not this table.
 */
const home = lazy(() => import("./pages/home"));
const board = lazy(() => import("./pages/board"));
const over = lazy(() => import("./pages/over"));
const leaderboard = lazy(() => import("./pages/leaderboard"));
const PAGE_MODULES: Record<string, ComponentType> = {
  welcome: lazy(() => import("./pages/welcome")),
  "": home,
  play: lazy(() => import("./pages/play")),
  "play/challenge": lazy(() => import("./pages/purchase")),
  "game/:gameId": board,
  training: board,
  tutorial: board,
  "game/:gameId/over": over,
  "training/over": over,
  "leaderboard/:day?": leaderboard,
  "player/:id": lazy(() => import("./pages/player")),
  "quests/:day?": lazy(() => import("./pages/quests")),
  achievements: lazy(() => import("./pages/achievements")),
  vault: lazy(() => import("./pages/vault")),
  referral: lazy(() => import("./pages/referral")),
  "settings/theme": lazy(() => import("./pages/theme")),
  settings: lazy(() => import("./pages/settings")),
};
const NotFound = lazy(() => import("./pages/not-found"));

/** A redirect that keeps the request's `?ref=`. */
function to(path: string, request: Request) {
  return redirect(withRef(path, new URL(request.url).search));
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

const LOADERS: Record<string, RouteObject["loader"]> = { "": homeLoader, welcome: welcomeLoader };

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    hydrateFallbackElement: bootScreen,
    errorElement: <RouteError />,
    children: [
      ...PAGES.map((page): RouteObject => {
        const Page = PAGE_MODULES[page.path]!;
        const route = { handle: { page }, loader: LOADERS[page.path], element: <Page />, errorElement: <RouteError /> };
        return page.path === "" ? { index: true, ...route } : { path: page.path, ...route };
      }),
      { path: "game", loader: gameRedirect },
      { path: "economy", loader: ({ request }) => to("/vault", request) },
      { path: "*", element: <NotFound />, errorElement: <RouteError /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

/** A router over a memory history, for the tests. */
export function createTestRouter(initialPath: string, mapRoutes: (routes: RouteObject[]) => RouteObject[] = (r) => r) {
  // A copy, so a test that edits a route leaves the table the next test reads untouched.
  const copy = (rs: RouteObject[]): RouteObject[] => rs.map((r) => (r.children ? { ...r, children: copy(r.children) } : { ...r }) as RouteObject);
  return createMemoryRouter(mapRoutes(copy(routes)), { initialEntries: [initialPath] });
}
