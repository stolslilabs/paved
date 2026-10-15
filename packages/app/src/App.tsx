import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type createBrowserRouter } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { MotionProvider } from "./components/MotionProvider";
import { queryClient } from "./lib/query-client";
import { router } from "./routes/router";

/** The providers of section 3.3 (server state) and 3.2 (motion) around the router. */
export function App({ router: r = router }: { router?: ReturnType<typeof createBrowserRouter> }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <RouterProvider router={r} />
        <Toaster />
      </MotionProvider>
    </QueryClientProvider>
  );
}
