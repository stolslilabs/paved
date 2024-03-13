import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { useStarknetkitConnectModal } from "starknetkit";
import { Address } from "./Address";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOut } from "@fortawesome/free-solid-svg-icons";
import { useDojo } from "@/dojo/useDojo";

export function Connection() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();

  const {
    account: { account, create, clear },
    masterAccount,
  } = useDojo();

  const connectWallet = async () => {
    const { starknetkitConnectModal } = useStarknetkitConnectModal({
      // @ts-ignore
      connectors: connectors,
    });
    const { connector } = await starknetkitConnectModal();
    connect({ connector });

    // Manage burner account
    if (account !== masterAccount) {
      // check if burner still valid
      try {
        await account?.getNonce();
      } catch (e: any) {
        console.log(e);

        clear();
        console.log("Burner cleared!");

        create();
        console.log("Burner created!");
      }
    } else {
      // create burner account
      create();
    }
  };

  return (
    <>
      {isConnected ? (
        <div className="flex gap-4 mr-4">
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
          className="px-4 mr-4"
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
