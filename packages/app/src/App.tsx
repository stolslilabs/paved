import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type createBrowserRouter } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { MotionProvider } from "./components/MotionProvider";
import { useDataSources, type DataSources } from "./data/sources";
import { usePageGestures } from "./lib/page-gestures";
import { queryClient } from "./lib/query-client";
import { router } from "./routes/router";
import { APP_SOURCES } from "./routes/sources";
import { WalletProvider, type LoadConnector } from "./wallet/wallet";

// Its own chunk (the bundle rule). The toasts are not worth a crash: a failed download leaves them off until a reload.
const CompletionTracker = lazy(() => import("./routes/completion-host").catch(() => ({ default: () => null })));

/** The completion toasts' tracking (`routes/completion-host.tsx`), loaded for a signer only: a guest has nothing to track. */
function CompletionHost() {
  const { signer } = useDataSources();
  return signer ? (
    <Suspense fallback={null}>
      <CompletionTracker playerId={signer.address} />
    </Suspense>
  ) : null;
}

/**
 * The providers of section 3.3 (server state, the data hooks' sources, the wallet that fills their signer) and 3.2
 * (motion) around the router, the toasts' host and the completion toasts' tracking (issue 595). A test gives its own sources and wallet connector (`connector`).
 */
export function App({
  router: r = router,
  sources = APP_SOURCES,
  connector,
}: {
  router?: ReturnType<typeof createBrowserRouter>;
  sources?: DataSources;
  connector?: LoadConnector;
}) {
  usePageGestures();
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider sources={sources} load={connector}>
        <MotionProvider>
          <RouterProvider router={r} />
          <Toaster />
          <CompletionHost />
        </MotionProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}
