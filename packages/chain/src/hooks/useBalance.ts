import { useState, useEffect } from "react";
import { DojoProvider } from "@dojoengine/core";

function parseBalance(result: unknown): bigint | null {
  if (result == null) return null;
  if (typeof result === "bigint") return result;
  if (typeof result === "string" || typeof result === "number") {
    return BigInt(String(result));
  }
  if (Array.isArray(result)) {
    for (const value of result) {
      const parsed = parseBalance(value);
      if (parsed != null) return parsed;
    }
    return null;
  }
  if (typeof result === "object") {
    const asRecord = result as Record<string, unknown>;
    const preferredKeys = ["balance", "value", "amount", "low", "high", "0"];
    for (const key of preferredKeys) {
      if (key in asRecord) {
        const parsed = parseBalance(asRecord[key]);
        if (parsed != null) return parsed;
      }
    }
    for (const value of Object.values(asRecord)) {
      const parsed = parseBalance(value);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

export function useBalance(provider: DojoProvider | null, address: string | null) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider || !address) return;

    let cancelled = false;

    const pollBalance = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await provider.call("paved", {
          contractName: "Token",
          entrypoint: "balanceOf",
          calldata: [address],
        });
        const parsed = parseBalance(result);
        if (!cancelled && parsed != null) {
          setBalance(parsed);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to read token balance");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    pollBalance();
    const interval = setInterval(pollBalance, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [provider, address]);

  return { balance, loading, error };
}

export { parseBalance };
