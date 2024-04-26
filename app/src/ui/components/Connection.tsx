import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { useStarknetkitConnectModal } from "starknetkit";
import { Address } from "./Address";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOut } from "@fortawesome/free-solid-svg-icons";
import { useDojo } from "@/dojo/useDojo";

export const PREFUND_AMOUNT = "0x3635C9ADC5DEA00000";

export function Connection() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();
  const [isSetup, setIsSetup] = useState(false);

  const {
    setup: {
      config: { masterAddress },
    },
    account: { account, create, clear },
  } = useDojo();

  const connectWallet = async () => {
    const { starknetkitConnectModal } = useStarknetkitConnectModal({
      // @ts-ignore
      connectors: connectors,
    });
    const { connector } = await starknetkitConnectModal();
    connect({ connector });

    // Manage burner account
    if (account.address !== masterAddress) {
      // check if burner still valid
      try {
        await account?.getNonce();
      } catch (e: any) {
        console.log(e);

        clear();
        console.log("Burner cleared!");

        create({ prefundedAmount: PREFUND_AMOUNT });
        console.log("Burner created!");
        setIsSetup(true);
      }
    } else {
      // create burner account
      create({ prefundedAmount: PREFUND_AMOUNT });
      setIsSetup(true);
    }
  };

  return (
    <>
      {isConnected && isSetup ? (
        <div className="flex gap-4 border-4 border-paved-brown p-2">
          <Address />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={"secondary"}
                  size={"icon"}
                  onClick={() => disconnect()}
                >
                  <FontAwesomeIcon icon={faSignOut} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="select-none">Log out</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        <Button
          className="px-4 "
          variant={"secondary"}
          size={"sm"}
          onClick={connectWallet}
        >
          Log in
        </Button>
      )}
    </>
  );
}
