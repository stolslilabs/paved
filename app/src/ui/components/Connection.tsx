import { Button } from "@/ui/elements/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/elements/tooltip";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { useStarknetkitConnectModal } from "starknetkit";
import { Address } from "./Address";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOut } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
// import { useDojo } from "@/dojo/useDojo";
import useClipboard from "react-use-clipboard";

export const PREFUND_AMOUNT = "0x3635C9ADC5DEA00000";

export function Connection() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected, address } = useAccount();
  // const [isSetup, setIsSetup] = useState(false);

  // const {
  //   setup: {
  //     config: { masterAddress },
  //   },
  //   account: { account, create, clear },
  // } = useDojo();

  console.log(address);

  const connectWallet = async () => {
    // const { starknetkitConnectModal } = useStarknetkitConnectModal({
    //   // @ts-ignore
    //   connectors: connectors,
    // });
    // const { connector } = await starknetkitConnectModal();

    console.log(connectors[0]);
    connect({ connector: connectors[0] });

    // Manage burner account
    //   if (account.address !== masterAddress) {
    //     // check if burner still valid
    //     try {
    //       await account?.getNonce();
    //     } catch (e: any) {
    //       console.log(e);

    //       clear();
    //       console.log("Burner cleared!");

    //       create({ prefundedAmount: PREFUND_AMOUNT });
    //       console.log("Burner created!");
    //       setIsSetup(true);
    //     }
    //   } else {
    //     // create burner account
    //     create({ prefundedAmount: PREFUND_AMOUNT });
    //     setIsSetup(true);
    //   }
  };

  return (
    <>
      {isConnected ? (
        <div className="flex gap-4  p-2">
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
