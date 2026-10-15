import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { DayView, GameView, PlayerGame, PriceView, QuoteView, SplitView, TermsView, VaultPosition } from "@paved/chain";
import { queryKeys } from "./keys";
import { useDataSources } from "./sources";

// The chain's reads (section 6.4), one hook each, returning the type the scene's prop takes. A hook whose input is
// missing (no player, no game id) is disabled: its `data` stays undefined. The economy's hooks answer null without an
// economy deployment (the vault scene's `deployed: false`).

/** `Challenge.spawn_paused()` (home, play, purchase). */
export function useSpawnPaused(): UseQueryResult<boolean> {
  const { views } = useDataSources();
  return useQuery({ queryKey: queryKeys.chain.spawnPaused(), queryFn: () => views.spawnPaused() });
}

/** `currentDay()`: today's Challenge day (home's top 3). */
export function useCurrentDay(): UseQueryResult<number> {
  const { views } = useDataSources();
  return useQuery({ queryKey: queryKeys.chain.currentDay(), queryFn: () => views.currentDay() });
}

/** `Challenge.entry_price()`: the token and the price of stake 1. */
export function useEntryPrice(): UseQueryResult<PriceView> {
  const { views } = useDataSources();
  return useQuery({ queryKey: queryKeys.chain.entryPrice(), queryFn: () => views.entryPrice() });
}

/** `Challenge.game(id)` (board, over). */
export function useGame(gameId: number | null): UseQueryResult<GameView> {
  const { views } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.game(gameId ?? 0),
    queryFn: () => views.game({ mode: "challenge", gameId: gameId as number }),
    enabled: gameId !== null,
  });
}

/** The player's games from the events, newest first; `open` keeps those not over. */
export function usePlayerGames(playerId: string | null, options: { open?: boolean } = {}): UseQueryResult<PlayerGame[]> {
  const { events } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.playerGames(playerId ?? "0x0"),
    queryFn: async () => [...(await events.playerGames(playerId as string, ["challenge"]))].sort((a, b) => b.startTime - a.startTime),
    enabled: playerId !== null,
    select: options.open ? (games) => games.filter((g) => !g.over) : undefined,
  });
}

/**
 * The home scene's `activeGame`: the newest of the player's games still open (events), read with `game(id)`; null when
 * none is open. A game past its `expiresAt` is still open (only a surrender closes it), so it is shown with its deadline.
 */
export function useActiveGame(playerId: string | null): UseQueryResult<GameView | null> {
  const { events, views } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.activeGame(playerId ?? "0x0"),
    queryFn: async () => {
      const open = (await events.playerGames(playerId as string, ["challenge"])).filter((g) => !g.over);
      const newest = open.sort((a, b) => b.startTime - a.startTime)[0];
      return newest ? views.game({ mode: newest.mode, gameId: newest.gameId }) : null;
    },
    enabled: playerId !== null,
  });
}

/** `Economy.quote(stake)` (purchase). */
export function useQuote(stake: number): UseQueryResult<QuoteView | null> {
  const { economy } = useDataSources();
  return useQuery({ queryKey: queryKeys.chain.quote(stake), queryFn: () => (economy ? economy.quote(stake) : null) });
}

/** `Economy.split_bps()` (purchase, vault, referral). */
export function useSplit(): UseQueryResult<SplitView | null> {
  const { economy } = useDataSources();
  return useQuery({ queryKey: queryKeys.chain.split(), queryFn: () => (economy ? economy.split() : null) });
}

/** The pool's `quote_swap(usdcIn)`: the PAVED the purchase's swap returns now (its `min_out` is derived from it). */
export function usePoolQuote(usdcIn: bigint | null): UseQueryResult<bigint | null> {
  const { pool } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.poolQuote(String(usdcIn ?? 0n)),
    queryFn: () => (pool ? pool.quoteSwap(usdcIn as bigint) : null),
    enabled: usdcIn !== null,
  });
}

/** `Economy.terms(id)`: a bought game's frozen terms and its settlement (over). */
export function useTerms(gameId: number | null): UseQueryResult<TermsView | null> {
  const { economy } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.terms(gameId ?? 0),
    queryFn: () => (economy ? economy.terms(gameId as number) : null),
    enabled: gameId !== null,
  });
}

/** `Economy.day(day)`: a closed day never changes, so it is not read again. */
export function useEconomyDay(day: number | null): UseQueryResult<DayView | null> {
  const { economy } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.day(day ?? 0),
    queryFn: () => (economy ? economy.day(day as number) : null),
    enabled: day !== null,
    staleTime: (query) => (query.state.data?.closed ? Infinity : 0),
  });
}

/** The viewer's Vault position (vault). */
export function useVaultPosition(account: string | null): UseQueryResult<VaultPosition | null> {
  const { economy } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.vault(account ?? "0x0"),
    queryFn: () => (economy ? economy.vault(account as string) : null),
    enabled: account !== null,
  });
}

/** USDC in the wallet, base units (purchase, home). */
export function useUsdcBalance(account: string | null): UseQueryResult<bigint | null> {
  const { economy } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.usdcBalance(account ?? "0x0"),
    queryFn: () => (economy ? economy.usdcBalance(account as string) : null),
    enabled: account !== null,
  });
}

/** PAVED in the wallet, base units (vault, home). */
export function usePavedBalance(account: string | null): UseQueryResult<bigint | null> {
  const { economy } = useDataSources();
  return useQuery({
    queryKey: queryKeys.chain.pavedBalance(account ?? "0x0"),
    queryFn: () => (economy ? economy.pavedBalance(account as string) : null),
    enabled: account !== null,
  });
}
