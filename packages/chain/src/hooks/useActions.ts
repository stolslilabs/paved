import { useCallback, useMemo, useState } from "react";
import type { Account } from "starknet";
import { DojoProvider } from "@dojoengine/core";
import { ModeType } from "@paved/game-core";
import { createSystems } from "../contracts";

export interface ActionState {
  loading: boolean;
  error: string | null;
}

export function useActions(provider: DojoProvider | null, account: Account | null, manifest?: any) {
  const [state, setState] = useState<ActionState>({ loading: false, error: null });
  const systems = useMemo(
    () => (provider ? createSystems(provider, manifest) : null),
    [provider, manifest],
  );

  const withLoading = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setState({ loading: true, error: null });
      try {
        const result = await fn();
        setState({ loading: false, error: null });
        return result;
      } catch (err: any) {
        const message = err?.message ?? "Transaction failed";
        console.error("Action failed:", message, err);
        setState({ loading: false, error: message });
        return null;
      }
    },
    []
  );

  const build = useCallback(
    async (params: {
      mode: ModeType;
      gameId: number;
      tileId: number;
      orientation: number;
      x: number;
      y: number;
      role: number;
      spot: number;
    }) => {
      if (!account || !systems) return null;
      return withLoading(() =>
        systems.build({ account, ...params })
      );
    },
    [account, systems, withLoading]
  );

  const discard = useCallback(
    async (mode: ModeType, gameId: number) => {
      if (!account || !systems) return null;
      return withLoading(() =>
        systems.discard({ account, mode, gameId })
      );
    },
    [account, systems, withLoading]
  );

  const surrender = useCallback(
    async (mode: ModeType, gameId: number) => {
      if (!account || !systems) return null;
      return withLoading(() =>
        systems.surrender({ account, mode, gameId })
      );
    },
    [account, systems, withLoading]
  );

  const spawn = useCallback(
    async (mode: ModeType) => {
      if (!account || !systems) return null;
      return withLoading(() =>
        systems.createGame({ account, mode })
      );
    },
    [account, systems, withLoading]
  );

  const claim = useCallback(
    async (mode: ModeType, tournamentId: number, rank: number) => {
      if (!account || !systems) return null;
      return withLoading(() =>
        systems.claim({ account, mode, tournamentId, rank })
      );
    },
    [account, systems, withLoading]
  );

  return {
    build,
    discard,
    surrender,
    spawn,
    claim,
    loading: state.loading,
    error: state.error,
  };
}
