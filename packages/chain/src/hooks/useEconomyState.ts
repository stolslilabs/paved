import { useEffect, useState } from "react";
import type { DojoProvider } from "@dojoengine/core";

export interface EconomyStateData {
  id: number;
  last_snapshot_time: number;
  last_supply: string;
  last_target: string;
  last_multiplier_fp: number;
  total_minted: string;
  total_burned: string;
  total_team_alloc: string;
}

function toValue(result: any, index: number, key: string, fallback: any): any {
  if (Array.isArray(result)) return result[index] ?? fallback;
  if (result && typeof result === "object") return result[key] ?? fallback;
  return fallback;
}

function parseState(result: any): EconomyStateData {
  return {
    id: Number(toValue(result, 0, "id", 0)),
    last_snapshot_time: Number(toValue(result, 1, "last_snapshot_time", 0)),
    last_supply: String(toValue(result, 2, "last_supply", "0")),
    last_target: String(toValue(result, 3, "last_target", "0")),
    last_multiplier_fp: Number(toValue(result, 4, "last_multiplier_fp", 0)),
    total_minted: String(toValue(result, 5, "total_minted", "0")),
    total_burned: String(toValue(result, 6, "total_burned", "0")),
    total_team_alloc: String(toValue(result, 7, "total_team_alloc", "0")),
  };
}

export function useEconomyState(provider: DojoProvider | null) {
  const [state, setState] = useState<EconomyStateData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) {
      setState(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await provider.call("paved", {
          contractName: "Economy",
          entrypoint: "get_state",
          calldata: [],
        });
        if (!cancelled) {
          setState(parseState(result));
        }
      } catch {
        if (!cancelled) {
          setError("Economy state unavailable");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    poll();
    const interval = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [provider]);

  return { state, isLoading, error };
}
