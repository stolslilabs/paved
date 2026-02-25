import { useCallback, useMemo, useState } from "react";
import type { Account } from "starknet";
import { DojoProvider } from "@dojoengine/core";
import type { GameCreateOptions, ModeType } from "@paved/game-core";
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
    async (mode: ModeType, options?: GameCreateOptions) => {
      if (!account || !systems) return null;
      return withLoading(() =>
        systems.createGame({ account, mode, ...options })
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

  const previewValidation = useCallback(
    async (configInput: GameCreateOptions["configInput"]) => {
      if (!systems || !configInput) return null;
      return withLoading(() =>
        systems.previewValidation({ configInput })
      );
    },
    [systems, withLoading]
  );

  return {
    build,
    discard,
    surrender,
    spawn,
    claim,
    previewValidation,
    loading: state.loading,
    error: state.error,
  };
}
