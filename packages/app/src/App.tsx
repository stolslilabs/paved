import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type createBrowserRouter } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { MotionProvider } from "./components/MotionProvider";
import { DataProvider, type DataSources } from "./data/sources";
import { queryClient } from "./lib/query-client";
import { router } from "./routes/router";
import { APP_SOURCES } from "./routes/sources";

/** The providers of section 3.3 (server state, the data hooks' sources) and 3.2 (motion) around the router. */
export function App({ router: r = router, sources = APP_SOURCES }: { router?: ReturnType<typeof createBrowserRouter>; sources?: DataSources }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataProvider sources={sources}>
        <MotionProvider>
          <RouterProvider router={r} />
          <Toaster />
        </MotionProvider>
      </DataProvider>
    </QueryClientProvider>
  );
}
