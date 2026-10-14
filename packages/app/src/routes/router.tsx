import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router";
import { PAGES } from "./pages";
import { Placeholder } from "./Placeholder";
import { FullScreenLayout, ShellLayout } from "./Shell";

function pageRoutes(withNav: boolean): RouteObject[] {
  return PAGES.filter((page) => (page.nav !== null) === withNav).map((page) =>
    page.path === ""
      ? { index: true, element: <Placeholder page={page} /> }
      : { path: page.path, element: <Placeholder page={page} /> },
  );
}

export const routes: RouteObject[] = [
  { element: <FullScreenLayout />, children: pageRoutes(false) },
  { path: "/", element: <ShellLayout />, children: pageRoutes(true) },
];

export const router = createBrowserRouter(routes);

/** A router over a memory history, for the tests. */
export function createTestRouter(initialPath: string) {
  return createMemoryRouter(routes, { initialEntries: [initialPath] });
}
