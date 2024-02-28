// @ts-ignore
import { InjectedConnector } from "starknetkit/injected";
// @ts-ignore
import { ArgentMobileConnector } from "starknetkit/argentMobile";
// @ts-ignore
import { WebWalletConnector } from "starknetkit/webwallet";
import { StarknetConfig, publicProvider } from "@starknet-react/core";
import { goerli, mainnet } from "@starknet-react/chains";

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  const chains = [goerli, mainnet];
  const provider = publicProvider();
  const connectors = [
    new InjectedConnector({ options: { id: "argentX", name: "Argent" } }),
    new InjectedConnector({ options: { id: "braavos", name: "Braavos" } }),
    new WebWalletConnector({ url: "https://web.argent.xyz" }),
    new ArgentMobileConnector(),
  ];

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
