import { useCallback, useState } from "react";
import { createSystems } from "../contracts";
export function useActions(config, account) {
    const [state, setState] = useState({ loading: false, error: null });
    const systems = createSystems(config);
    const withLoading = useCallback(async (fn) => {
        setState({ loading: true, error: null });
        try {
            const result = await fn();
            setState({ loading: false, error: null });
            return result;
        }
        catch (err) {
            const message = err?.message ?? "Transaction failed";
            setState({ loading: false, error: message });
            return null;
        }
    }, []);
    const build = useCallback(async (params) => {
        if (!account)
            return null;
        return withLoading(() => systems.build({ account, ...params }));
    }, [account, systems, withLoading]);
    const discard = useCallback(async (mode, gameId) => {
        if (!account)
            return null;
        return withLoading(() => systems.discard({ account, mode, gameId }));
    }, [account, systems, withLoading]);
    const surrender = useCallback(async (mode, gameId) => {
        if (!account)
            return null;
        return withLoading(() => systems.surrender({ account, mode, gameId }));
    }, [account, systems, withLoading]);
    const spawn = useCallback(async (mode) => {
        if (!account)
            return null;
        return withLoading(() => systems.createGame({ account, mode }));
    }, [account, systems, withLoading]);
    const claim = useCallback(async (mode, tournamentId, rank) => {
        if (!account)
            return null;
        return withLoading(() => systems.claim({ account, mode, tournamentId, rank }));
    }, [account, systems, withLoading]);
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
//# sourceMappingURL=useActions.js.map