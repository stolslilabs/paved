import { useState, useEffect } from "react";
import { DojoProvider } from "@dojoengine/core";

export function useBalance(provider: DojoProvider | null, address: string | null) {
  const [balance, setBalance] = useState<bigint>(0n);

  useEffect(() => {
    if (!provider || !address) return;

    let cancelled = false;

    const pollBalance = async () => {
      try {
        const result = await provider.call("paved", {
          contractName: "Token",
          entrypoint: "balanceOf",
          calldata: [address],
        });
        if (!cancelled && result != null) {
          // CallResult can be various shapes; extract the balance value
          if (Array.isArray(result) && result.length > 0) {
            setBalance(BigInt(String(result[0])));
          } else if (typeof result === "bigint") {
            setBalance(result);
          } else if (typeof result === "string") {
            setBalance(BigInt(result));
          }
        }
      } catch {
        // Silent fail on balance poll -- token contract may not be deployed
      }
    };

    pollBalance();
    const interval = setInterval(pollBalance, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [provider, address]);

  return { balance };
}
