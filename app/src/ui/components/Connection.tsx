import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TransactionFinalityStatus,
  CallData,
  Account,
  AccountInterface,
} from "starknet";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { useStarknetkitConnectModal } from "starknetkit";
import { Address } from "./Address";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOut } from "@fortawesome/free-solid-svg-icons";
import { useDojo } from "@/dojo/useDojo";

export const PREFUND_AMOUNT = "0x2386f26fc10000";

export function Connection() {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();
  const [isSetup, setIsSetup] = useState(false);

  const {
    setup: {
      config: { masterAddress, feeTokenAddress },
    },
    account: { account, create, clear, isDeploying },
    setup: {
      client: { host },
    },
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

        create();
        console.log("Burner created!");
        setIsSetup(true);
      }
    } else {
      // create burner account
      create();
      setIsSetup(true);
    }
  };

  const approve = useCallback(async (account: AccountInterface) => {
    // 5 seconds sleep
    await new Promise((resolve) => setTimeout(resolve, 5000));
    // Approve fee token
    console.log("Approving fee token to", host.address);
    const { transaction_hash } = await account.execute({
      contractAddress: feeTokenAddress,
      entrypoint: "approve",
      calldata: CallData.compile([host.address, PREFUND_AMOUNT, "0x0"]),
    });

    const result = account.waitForTransaction(transaction_hash, {
      retryInterval: 1000,
      successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
    });

    if (!result) {
      throw new Error("Transaction did not complete successfully.");
    }
  }, []);

  useEffect(() => {
    if (account.address !== masterAddress && isSetup && !isDeploying) {
      approve(account);
    }
  }, [account, isSetup, isDeploying]);

  return (
    <>
      {isConnected ? (
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
