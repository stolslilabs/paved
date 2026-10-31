import { QueryClient } from "@tanstack/react-query";
import { MOCKED } from "../data/data-source";

/**
 * The server-state cache (section 3.3). No polling: the refetch triggers are a write's receipt, window
 * focus and the user's action. `staleTime` is set per key by the queries themselves (P2). The cache is not
 * persisted: chain data must be fresh.
 *
 * On the mock (`mocked`, #927) every read and write is the device's: they run with the browser offline too (`networkMode`
 * "always"), where the default pauses them until the network is back.
 */
export function createQueryClient(mocked: boolean = MOCKED): QueryClient {
  const networkMode = mocked ? "always" : "online";
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: true, networkMode },
      mutations: { networkMode },
    },
  });
}

export const queryClient = createQueryClient();
