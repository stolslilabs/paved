import { useEffect, useState } from "react";
import type { DojoProvider } from "@dojoengine/core";
import { parseBalance } from "./useBalance";

export function useTokenSupply(provider: DojoProvider | null) {
  const [supply, setSupply] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) {
      setSupply(0n);
      setError(null);
      return;
    }

    let cancelled = false;

    const pollSupply = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await provider.call("paved", {
          contractName: "Token",
          entrypoint: "totalSupply",
          calldata: [],
        });
        const parsed = parseBalance(result);
        if (!cancelled && parsed != null) {
          setSupply(parsed);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to read token supply");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    pollSupply();
    const interval = setInterval(pollSupply, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [provider]);

  return { supply, loading, error };
}
