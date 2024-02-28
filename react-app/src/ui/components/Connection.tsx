import { Button } from "@/components/ui/button";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { useStarknetkitConnectModal } from "starknetkit";
import { Address } from "./Address";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOut } from "@fortawesome/free-solid-svg-icons";

export function Connection() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();

  const connectWallet = async () => {
    // @ts-ignore
    const { starknetkitConnectModal } = useStarknetkitConnectModal({
      connectors: connectors,
    });
    const { connector } = await starknetkitConnectModal();
    connect({ connector });
  };

  return (
    <>
      {isConnected ? (
        <div className="flex gap-4">
          <Address />
          <Button
            variant={"secondary"}
            size={"icon"}
            onClick={() => disconnect()}
          >
            <FontAwesomeIcon icon={faSignOut} />
          </Button>
        </div>
      ) : (
        <Button
          className="px-4"
          variant={"secondary"}
          size={"sm"}
          onClick={connectWallet}
        >
          Connect Wallet
        </Button>
      )}
    </>
  );
}
