import { useEffect, useState } from "react";
import type { DojoProvider } from "@dojoengine/core";

export interface EconomyConfigState {
  id: number;
  target_mode: number;
  target_fixed: string;
  target_a: string;
  target_b: string;
  target_t0: number;
  team_bps: number;
  burn_bps: number;
  max_multiplier_fp: number;
  fp_scale: number;
  manual_target_override: boolean;
  target_override: string;
}

const EMPTY_CONFIG: EconomyConfigState = {
  id: 0,
  target_mode: 0,
  target_fixed: "0",
  target_a: "0",
  target_b: "0",
  target_t0: 0,
  team_bps: 0,
  burn_bps: 0,
  max_multiplier_fp: 0,
  fp_scale: 1_000_000,
  manual_target_override: false,
  target_override: "0",
};

function toValue(result: any, index: number, key: string, fallback: any): any {
  if (Array.isArray(result)) return result[index] ?? fallback;
  if (result && typeof result === "object") return result[key] ?? fallback;
  return fallback;
}

function parseConfig(result: any): EconomyConfigState {
  return {
    id: Number(toValue(result, 0, "id", 0)),
    target_mode: Number(toValue(result, 1, "target_mode", 0)),
    target_fixed: String(toValue(result, 2, "target_fixed", "0")),
    target_a: String(toValue(result, 3, "target_a", "0")),
    target_b: String(toValue(result, 4, "target_b", "0")),
    target_t0: Number(toValue(result, 5, "target_t0", 0)),
    team_bps: Number(toValue(result, 6, "team_bps", 0)),
    burn_bps: Number(toValue(result, 7, "burn_bps", 0)),
    max_multiplier_fp: Number(toValue(result, 8, "max_multiplier_fp", 0)),
    fp_scale: Number(toValue(result, 9, "fp_scale", 1_000_000)),
    manual_target_override: Boolean(toValue(result, 10, "manual_target_override", false)),
    target_override: String(toValue(result, 11, "target_override", "0")),
  };
}

export function useEconomyConfig(provider: DojoProvider | null) {
  const [config, setConfig] = useState<EconomyConfigState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) {
      setConfig(null);
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
          entrypoint: "get_config",
          calldata: [],
        });

        if (!cancelled) {
          setConfig(parseConfig(result));
        }
      } catch {
        if (!cancelled) {
          setError("Economy config unavailable");
          setConfig(EMPTY_CONFIG);
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

  return { config, isLoading, error };
}
