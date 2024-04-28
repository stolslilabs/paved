import { useMemo } from "react";
// @ts-ignore
import { ArgentMobileConnector } from "starknetkit/argentMobile";
// @ts-ignore
import { WebWalletConnector } from "starknetkit/webwallet";
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
    return [
      braavos(),
      argent(),
      // new WebWalletConnector({ url: "https://web.argent.xyz" }),
      // new ArgentMobileConnector(),
    ];
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
