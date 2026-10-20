import { lazy, type ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, replace, type LoaderFunctionArgs, type RouteObject } from "react-router";
import { PAGE_LOADERS, type PageLoader } from "./page-loaders";
import { PAGES } from "./pages";
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

const LOADERS: Record<string, RouteObject["loader"]> = { "": homeLoader, welcome: welcomeLoader, "play/challenge": challengeLoader };

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    hydrateFallbackElement: bootScreen,
    errorElement: <RouteError />,
    children: [
      ...PAGES.map((page): RouteObject => {
        const Page = pageComponent(page.path);
        const route = { handle: { page }, loader: LOADERS[page.path], element: <Page />, errorElement: <RouteError /> };
        return page.path === "" ? { index: true, ...route } : { path: page.path, ...route };
      }),
      { path: "game", loader: gameRedirect },
      { path: "quests/:day?", loader: ({ request, params }) => to(params.day ? `/missions/${params.day}` : "/missions", request) },
      { path: "achievements", loader: ({ request }) => to("/missions/lifetime", request) },
      { path: "economy", loader: ({ request }) => to("/vault", request) },
      // The ranks left the UI (#623), to come back as leagues: their old links land on Home.
      { path: "leaderboard/:day?", loader: ({ request }) => to("/", request) },
      { path: "player/:id", loader: ({ request }) => to("/", request) },
      // The scripted tutorial gave way to Story mode (#546), whose first campaign teaches the rules.
      { path: "tutorial", loader: ({ request }) => to("/story", request) },
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
