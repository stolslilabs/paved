import { useMemo } from "react";
import {
  StarknetConfig,
  nethermindProvider,
  braavos,
  argent,
} from "@starknet-react/core";
import { mainnet } from "@starknet-react/chains";

const { VITE_PUBLIC_API_KEY } = import.meta.env;

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  const chains = [mainnet];
  const provider = nethermindProvider({ apiKey: VITE_PUBLIC_API_KEY });
  const connectors = useMemo(() => {
    return [braavos(), argent()];
  }, []);

  return (
    <StarknetConfig
      chains={chains}
      provider={provider}
      connectors={connectors}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
