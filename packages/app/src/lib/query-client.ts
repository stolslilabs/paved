import { QueryClient } from "@tanstack/react-query";

/**
 * The server-state cache (section 3.3). No polling: the refetch triggers are a write's receipt, window
 * focus and the user's action. `staleTime` is set per key by the queries themselves (P2). The cache is not
 * persisted: chain data must be fresh.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: true },
    },
  });
}

export const queryClient = createQueryClient();
